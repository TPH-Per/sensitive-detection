import { User } from '../../shared/types';

export const getHybridReason = (currentUser: User | null, otherUser: User): string => {
  if (!currentUser) return "Có thể bạn quen";

  const matches: { label: string; shortLabel: string }[] = [];

  // 1. Trường học (Ưu tiên cao nhất)
  if (currentUser.school && otherUser.school && currentUser.school === otherUser.school) {
    matches.push({
      label: `Học cùng trường tại ${otherUser.school}`,
      shortLabel: otherUser.school,
    });
  }

  // 2. Sở thích chung
  const currentInterests = currentUser.interests || [];
  const otherInterests = otherUser.interests || [];
  const mutualInterests = currentInterests.filter((i) => otherInterests.includes(i));
  if (mutualInterests.length > 0) {
    matches.push({
      label: mutualInterests.length >= 2
        ? `Cùng chung ${mutualInterests.length} sở thích`
        : `Chung sở thích ${mutualInterests[0]}`,
      shortLabel: `${mutualInterests.length} sở thích`,
    });
  }

  // 3. Địa điểm
  if (currentUser.location && otherUser.location && currentUser.location === otherUser.location) {
    matches.push({
      label: `Cùng sống tại ${otherUser.location}`,
      shortLabel: otherUser.location,
    });
  }

  // 4. Thế hệ
  if (currentUser.generation && otherUser.generation && currentUser.generation === otherUser.generation) {
    matches.push({
      label: `Cùng thế hệ ${otherUser.generation}`,
      shortLabel: `Thế hệ ${otherUser.generation}`,
    });
  }

  if (matches.length === 0) return "Có thể bạn quen";
  
  if (matches.length === 1) return matches[0].label;

  if (matches.length === 2) {
    return `Cùng ${matches[0].shortLabel} & ${matches[1].shortLabel}`;
  }

  return `Cùng ${matches[0].shortLabel} & ${matches.length - 1} điểm chung khác`;
};
