import { useState, useEffect } from 'react';
import { Shield, ArrowLeft, Ban, Trash2, User, BookOpen, FileText, Target, Layers } from 'lucide-react';
import { checkAdmin, listUsers, getUser, toggleBan, deleteUser } from '../../../api/admin';
import LoadingSpinner from '../../shared/LoadingSpinner';

export default function AdminApp() {
  const [isAdmin, setIsAdmin] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    checkAdmin().then(d => {
      setIsAdmin(d.isAdmin);
      if (d.isAdmin) return listUsers();
      return null;
    }).then(d => {
      if (d) setUsers(d.users || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function refresh() {
    const d = await listUsers();
    setUsers(d.users || []);
  }

  async function handleBan(uid) {
    const r = await toggleBan(uid);
    setUsers(prev => prev.map(u => u.id === uid ? { ...u, banned: r.banned } : u));
    if (selectedUser?.id === uid) setSelectedUser(prev => ({ ...prev, banned: r.banned }));
  }

  async function handleDelete(uid) {
    if (!confirm('Permanently delete this user and all their data?')) return;
    await deleteUser(uid);
    setUsers(prev => prev.filter(u => u.id !== uid));
    if (selectedUser?.id === uid) { setView('list'); setSelectedUser(null); }
  }

  async function openUser(uid) {
    try {
      const d = await getUser(uid);
      setSelectedUser(d.user);
      setView('detail');
    } catch {}
  }

  if (loading) return <div className="flex items-center justify-center h-48"><LoadingSpinner size={24} /></div>;

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Shield size={36} className="text-gray-400 mb-3" />
        <p className="text-sm text-gray-500">Admin access required</p>
        <p className="text-xs text-gray-400 mt-1">Set your social handle to @goon</p>
      </div>
    );
  }

  // User detail
  if (view === 'detail' && selectedUser) {
    const u = selectedUser;
    return (
      <div>
        <button onClick={() => { setView('list'); setSelectedUser(null); }} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 mb-4">
          <ArrowLeft size={16} /> All Users
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-lg font-bold text-blue-600">
            {u.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{u.name || 'Unknown'}</h2>
            <p className="text-xs text-gray-500">{u.email} {u.handle ? `· @${u.handle}` : ''}</p>
          </div>
          {u.banned && <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 text-xs font-medium">Banned</span>}
        </div>

        <div className="flex gap-2 mb-5">
          <button onClick={() => handleBan(u.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${u.banned ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
            <Ban size={12} className="inline mr-1" /> {u.banned ? 'Unban' : 'Ban'}
          </button>
          <button onClick={() => handleDelete(u.id)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-[#1e1e2e] text-rose-500">
            <Trash2 size={12} className="inline mr-1" /> Delete
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-white dark:bg-[#1e1e2e] rounded-lg border border-gray-200 dark:border-[#2A2A40] p-3">
            <p className="text-xs text-gray-400">Level</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{u.profile?.level || 1}</p>
          </div>
          <div className="bg-white dark:bg-[#1e1e2e] rounded-lg border border-gray-200 dark:border-[#2A2A40] p-3">
            <p className="text-xs text-gray-400">XP</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{u.profile?.xp || 0}</p>
          </div>
        </div>

        {/* Curricula */}
        {u.curricula?.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2"><BookOpen size={10} className="inline mr-1" /> Curricula ({u.curricula.length})</h3>
            <div className="space-y-1">
              {u.curricula.map(c => (
                <div key={c.id} className="px-3 py-2 rounded-lg bg-white dark:bg-[#1e1e2e] border border-gray-200 dark:border-[#2A2A40] text-sm text-gray-900 dark:text-gray-100">
                  {c.title} <span className="text-xs text-gray-400">· {c.unitCount} units</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {u.notes?.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2"><FileText size={10} className="inline mr-1" /> Notes ({u.notes.length})</h3>
            <div className="space-y-1">
              {u.notes.map(n => (
                <div key={n.id} className="px-3 py-2 rounded-lg bg-white dark:bg-[#1e1e2e] border border-gray-200 dark:border-[#2A2A40] text-sm text-gray-900 dark:text-gray-100">
                  {n.title} <span className="text-xs text-gray-400">· {n.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Goals */}
        {u.goals?.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2"><Target size={10} className="inline mr-1" /> Goals ({u.goals.length})</h3>
            <div className="space-y-1">
              {u.goals.map(g => (
                <div key={g.id} className="px-3 py-2 rounded-lg bg-white dark:bg-[#1e1e2e] border border-gray-200 dark:border-[#2A2A40] text-sm text-gray-900 dark:text-gray-100">
                  {g.title} <span className={`text-xs ${g.status === 'active' ? 'text-emerald-500' : 'text-gray-400'}`}>· {g.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Flashcards */}
        {u.flashcardDecks?.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2"><Layers size={10} className="inline mr-1" /> Flashcards ({u.flashcardDecks.length})</h3>
            <div className="space-y-1">
              {u.flashcardDecks.map(d => (
                <div key={d.id} className="px-3 py-2 rounded-lg bg-white dark:bg-[#1e1e2e] border border-gray-200 dark:border-[#2A2A40] text-sm text-gray-900 dark:text-gray-100">
                  {d.title} <span className="text-xs text-gray-400">· {d.cardCount} cards</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // User list
  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <Shield size={20} className="text-blue-500" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Admin Panel</h2>
        <span className="text-xs text-gray-400 ml-auto">{users.length} users</span>
      </div>

      <div className="space-y-1.5">
        {users.map(u => (
          <div key={u.id} onClick={() => openUser(u.id)} className="flex items-center gap-3 bg-white dark:bg-[#1e1e2e] rounded-xl border border-gray-200 dark:border-[#2A2A40] px-4 py-3 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-bold text-blue-600">
              {u.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{u.name || u.email}</p>
                {u.banned && <span className="px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-500 text-[10px] font-medium">Banned</span>}
              </div>
              <p className="text-[10px] text-gray-400">{u.handle ? `@${u.handle} · ` : ''}{u.email} · L{u.level} · {u.curriculaCount} curricula</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
