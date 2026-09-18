'use client';

import React, { useState, useEffect } from 'react';
import { Users, Shield, RefreshCw, Loader2, Search } from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';

export default function AdminUsersPage() {
  const { t, lang } = useLanguage();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [searchUser, setSearchUser] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleRole(userId: string, currentRole: string, email: string) {
    const newRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการเปลี่ยนสิทธิ์ของ "${email}" เป็น ${newRole}?`)) {
      return;
    }

    setUpdatingUser(userId);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, newRole }),
      });
      const data = await res.json();
      if (data.success) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
        );
      } else {
        alert(data.error || 'เกิดข้อผิดพลาดในการเปลี่ยนสิทธิ์');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingUser(null);
    }
  }

  const filteredUsers = users.filter((u) =>
    (u.name + u.email).toLowerCase().includes(searchUser.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex-shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{t('adminTabUsers')}</h1>
            <p className="text-xs text-slate-400">รายชื่อผู้ใช้งานทั้งหมดในระบบและการจัดการระดับสิทธิ์ (ADMIN / USER)</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold">
            <span className="text-slate-400">ทั้งหมด: </span>
            <span className="text-amber-400 font-bold">{users.length} คน</span>
          </div>
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-950 border border-slate-800 rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            <span>{t('refresh')}</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center gap-3">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchUser}
          onChange={(e) => setSearchUser(e.target.value)}
          placeholder="ค้นหาชื่อหรืออีเมลผู้ใช้งาน..."
          className="w-full bg-transparent text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
      </div>

      {/* Users Table */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
          <p className="text-xs text-slate-400">{t('loading')}</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="text-slate-400 uppercase bg-slate-950/60 border-b border-slate-800">
                <tr>
                  <th className="p-4 pl-5">{t('userColNameEmail')}</th>
                  <th className="p-4">{t('userColRole')}</th>
                  <th className="p-4">{t('userColNovelsTranslated')}</th>
                  <th className="p-4">{t('userColRegisteredDate')}</th>
                  <th className="p-4 pr-5 text-right">{t('userColManageRole')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-500 text-xs">
                      ไม่พบผู้ใช้งานที่ค้นหา
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-4 pl-5 font-semibold text-slate-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-amber-400 text-xs flex-shrink-0 overflow-hidden">
                            {u.avatar ? (
                              <img src={u.avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              u.name?.[0]?.toUpperCase() || 'U'
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-slate-100">{u.name || t('userNoName')}</div>
                            <div className="text-[11px] text-slate-400 font-normal font-mono">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${
                            u.role === 'ADMIN'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="p-4 font-semibold text-slate-300">
                        {u._count?.submittedNovels || 0} {t('storiesUnit')}
                      </td>
                      <td className="p-4 text-slate-400 font-mono">
                        {new Date(u.createdAt).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US')}
                      </td>
                      <td className="p-4 pr-5 text-right">
                        <button
                          onClick={() => handleToggleRole(u.id, u.role, u.email)}
                          disabled={updatingUser === u.id}
                          className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-xl transition-all disabled:opacity-50"
                        >
                          {updatingUser === u.id
                            ? t('updating')
                            : u.role === 'ADMIN'
                            ? t('demoteToUser')
                            : t('promoteToAdmin')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
