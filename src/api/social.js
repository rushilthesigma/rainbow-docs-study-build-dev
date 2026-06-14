import { apiFetch } from './client';

// Account directory helpers. The former Social hub (friends / DMs / group
// chat) was removed - sharing works with any account directly, so only the
// account lookup endpoints remain here:
//   • getMyProfile - viewer's account profile lookup
//   • searchUsers  - used by ShareDialog to find any account to share with
//                    (no friending required)
export const getMyProfile = () => apiFetch('/api/social/profile');
export const searchUsers = (q) => apiFetch(`/api/social/search?q=${encodeURIComponent(q)}`);
