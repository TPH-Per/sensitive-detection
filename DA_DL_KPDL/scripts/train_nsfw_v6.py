import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import argparse
import logging
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from sklearn.metrics import f1_score, roc_auc_score, accuracy_score, precision_score, recall_score, average_precision_score
from tqdm import tqdm
import numpy as np

from scripts._common import append_epoch_metrics
from src.models.nsfw_classifier import NSFWClassifier, NSFWDataset, collect_nsfw_images
from src.data.split_utils import get_split_from_id

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def get_optimizer_nsfw(model, lr_backbone=1e-4, lr_head=1e-3):
    backbone_params = [p for n, p in model.backbone.named_parameters() if p.requires_grad]
    head_params = list(model.head.parameters())
    return torch.optim.AdamW([
        {"params": backbone_params, "lr": lr_backbone},
        {"params": head_params, "lr": lr_head},
    ], weight_decay=1e-4)

def train_nsfw(args):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    logging.info(f"Using device: {device}")

    # 1. Collect paths
    pos_paths, neg_paths = collect_nsfw_images(Path(args.nsfw_root))

    if not pos_paths or not neg_paths:
        logging.error("Missing positive or negative samples! Check dataset paths.")
        return

    # Split deterministic bằng Hash để đồng bộ với E2E (Chống Leakage)
    train_pos = [p for p in pos_paths if get_split_from_id(str(p)) == 'train']
    val_pos   = [p for p in pos_paths if get_split_from_id(str(p)) == 'val']
    
    train_neg = [p for p in neg_paths if get_split_from_id(str(p)) == 'train']
    val_neg   = [p for p in neg_paths if get_split_from_id(str(p)) == 'val']
    
    train_ds = NSFWDataset(train_pos, train_neg)
    val_ds   = NSFWDataset(val_pos, val_neg)

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, num_workers=4, pin_memory=True)
    val_loader   = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, num_workers=4, pin_memory=True)

    # Calculate recommended pos_weight
    rec_pos_weight = NSFWDataset.recommended_pos_weight(train_pos, train_neg)
    use_pos_weight = args.pos_weight if args.pos_weight > 0 else rec_pos_weight
    logging.info(f"Using pos_weight: {use_pos_weight:.3f}")

    # 2. Model & Optimizer
    model = NSFWClassifier(args.unfreeze_from_layer).to(device)
    
    optimizer = get_optimizer_nsfw(model, lr_backbone=args.lr, lr_head=1e-3)
    criterion = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([use_pos_weight]).to(device))
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    # 3. Train Loop
    best_f1 = 0.0
    patience_cnt = 0
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for epoch in range(args.epochs):
        model.train()
        train_loss = 0.0
        train_probs, train_labels = [], []
        pbar = tqdm(train_loader, desc=f"Epoch {epoch+1}/{args.epochs} [Train]")
        for x, y in pbar:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            logits = model(x)
            loss = criterion(logits, y)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()
            train_probs.extend(torch.sigmoid(logits).detach().cpu().squeeze(1).numpy())
            train_labels.extend(y.detach().cpu().squeeze(1).numpy())
            pbar.set_postfix(loss=loss.item())

        train_loss /= len(train_loader)
        scheduler.step()

        train_probs = np.array(train_probs)
        train_labels = np.array(train_labels)
        train_preds = (train_probs >= 0.5).astype(int)
        train_acc = accuracy_score(train_labels, train_preds)
        train_prec = precision_score(train_labels, train_preds, zero_division=0)
        train_rec = recall_score(train_labels, train_preds, zero_division=0)
        train_f1 = f1_score(train_labels, train_preds, zero_division=0)
        try:
            train_auc = roc_auc_score(train_labels, train_probs)
        except ValueError:
            train_auc = 0.0
        try:
            train_pr_auc = average_precision_score(train_labels, train_probs)
        except ValueError:
            train_pr_auc = 0.0

        # Validation
        model.eval()
        val_loss = 0.0
        all_preds = []
        all_labels = []
        with torch.no_grad():
            for x, y in tqdm(val_loader, desc=f"Epoch {epoch+1}/{args.epochs} [Val]"):
                x, y = x.to(device), y.to(device)
                logits = model(x)
                loss = criterion(logits, y)
                val_loss += loss.item()
                
                probs = torch.sigmoid(logits).cpu().squeeze(1).numpy()
                all_preds.extend(probs)
                all_labels.extend(y.cpu().squeeze(1).numpy())

        val_loss /= len(val_loader)
        all_preds = np.array(all_preds)
        all_labels = np.array(all_labels)
        
        preds_bin = (all_preds >= 0.5).astype(int)
        val_acc = accuracy_score(all_labels, preds_bin)
        val_prec = precision_score(all_labels, preds_bin, zero_division=0)
        val_rec = recall_score(all_labels, preds_bin, zero_division=0)
        val_f1 = f1_score(all_labels, preds_bin, zero_division=0)
        
        try:
            val_auc = roc_auc_score(all_labels, all_preds)
        except ValueError:
            val_auc = 0.0
        try:
            val_pr_auc = average_precision_score(all_labels, all_preds)
        except ValueError:
            val_pr_auc = 0.0

        logging.info(
            f"Epoch {epoch+1} - Train Loss: {train_loss:.4f} Acc: {train_acc:.4f} Prec: {train_prec:.4f} Rec: {train_rec:.4f} "
            f"F1: {train_f1:.4f} AUC: {train_auc:.4f} PR-AUC: {train_pr_auc:.4f} | "
            f"Val Loss: {val_loss:.4f} Acc: {val_acc:.4f} Prec: {val_prec:.4f} Rec: {val_rec:.4f} "
            f"F1: {val_f1:.4f} AUC: {val_auc:.4f} PR-AUC: {val_pr_auc:.4f}"
        )

        append_epoch_metrics(
            out_dir / "metrics" / "nsfw_metrics.csv",
            {
                "epoch": epoch + 1,
                "lr_backbone": optimizer.param_groups[0]["lr"],
                "lr_head": optimizer.param_groups[1]["lr"],
                "train_loss": train_loss,
                "train_acc": train_acc,
                "train_prec": train_prec,
                "train_rec": train_rec,
                "train_f1": train_f1,
                "train_auc": train_auc,
                "train_pr_auc": train_pr_auc,
                "val_loss": val_loss,
                "val_acc": val_acc,
                "val_prec": val_prec,
                "val_rec": val_rec,
                "val_f1": val_f1,
                "val_auc": val_auc,
                "val_pr_auc": val_pr_auc,
            },
        )

        if val_f1 > best_f1:
            best_f1 = val_f1
            patience_cnt = 0
            torch.save(model.state_dict(), out_dir / "nsfw_classifier_v6_best.pth")
            logging.info(f"  --> Saved new best model with F1: {val_f1:.4f}")
        else:
            patience_cnt += 1
            if patience_cnt >= args.patience:
                logging.info(f"Early stopping triggered after {epoch+1} epochs.")
                break

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--nsfw_root', required=True)
    parser.add_argument('--output_dir', default='/kaggle/working/trong_so')
    parser.add_argument('--unfreeze_from_layer', type=int, default=4)
    parser.add_argument('--pos_weight', type=float, default=-1.0, help='Set to >0 to override automatic calculation')
    parser.add_argument('--batch_size', type=int, default=128)
    parser.add_argument('--lr', type=float, default=1e-4)
    parser.add_argument('--epochs', type=int, default=25)
    parser.add_argument('--patience', type=int, default=5)
    args = parser.parse_args()
    
    train_nsfw(args)
