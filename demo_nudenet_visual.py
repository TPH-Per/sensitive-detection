import urllib.request
import cv2
from nudenet import NudeDetector

urls = {
    "Fashion_Portrait": "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600",
    "Beach_Lifestyle": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600",
    "Fitness": "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600"
}

detector = NudeDetector()
opener = urllib.request.build_opener()
opener.addheaders = [('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')]
urllib.request.install_opener(opener)

for name, url in urls.items():
    print(f"\n--- Testing: {name} ---")
    filename = f"{name}.jpg"
    out_filename = f"{name}_out.jpg"
    try:
        urllib.request.urlretrieve(url, filename)
        results = detector.detect(filename)
        
        img = cv2.imread(filename)
        
        if not results:
            print("No NSFW/Anatomy objects detected.")
        else:
            for result in results:
                # NudeNet box format: [x, y, width, height]
                box = result['box']
                x, y, w, h = int(box[0]), int(box[1]), int(box[2]), int(box[3])
                score = result['score']
                label = result['class']
                
                print(f"- Class: {label}, Score: {score:.4f}, Box: {box}")
                
                # Draw box and label
                color = (0, 255, 0) if "COVERED" in label or "FACE" in label else (0, 0, 255)
                cv2.rectangle(img, (x, y), (x + w, y + h), color, 2)
                cv2.putText(img, f"{label} ({score:.2f})", (x, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)
                
            cv2.imwrite(out_filename, img)
            print(f"Saved output with bounding boxes to {out_filename}")
    except Exception as e:
        print(f"Error processing {name}: {e}")
