import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { TopBar } from '@/components/layout/TopBar';
import { useIsRegulator, FEATURE_KEYS, FEATURE_LABELS, type FeatureKey } from '@/hooks/useFeatureUnlock';
import {
  Shield, Users, Unlock, Lock, Check, X, Loader2, Search,
  UserPlus, Briefcase, Trash2, Crown, Settings, ChevronRight,
  BarChart3, Bell, Star, Eye, TrendingUp, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { formatNumber } from '@/lib/utils';

// Module-level constants — esbuild guard
const DEPT_OPTIONS = ['Engineering', 'Content', 'Marketing', 'Moderation', 'Finance', 'Design', 'Operations'] as const;
const REG_PANEL_TABS = ['employees', 'features', 'platform', 'reports'] as const;
type RegTab = typeof REG_PANEL_TABS[number];

export default function RegulatorPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isReg = useIsRegulator();

  const [activeTab, setActiveTab] = useState<RegTab>('employees');
  const [loading, setLoading] = useState(true);

  // ── Employees ─────────────────────────────────────────────────────────────
  const [employees, setEmployees] = useState<any[]>([]);
  const [showHireDialog, setShowHireDialog] = useState(false);
  const [hireSearch, setHireSearch] = useState('');
  const [hireResults, setHireResults] = useState<any[]>([]);
  const [hireForm, setHireForm] = useState({ job_title: '', department: 'Engineering', notes: '' });
  const [selectedHireUser, setSelectedHireUser] = useState<any | null>(null);
  const [hiring, setHiring] = useState(false);

  // ── Feature Unlocks ───────────────────────────────────────────────────────
  const [unlockSearch, setUnlockSearch] = useState('');
  const [unlockResults, setUnlockResults] = useState<any[]>([]);
  const [selectedUnlockUser, setSelectedUnlockUser] = useState<any | null>(null);
  const [userUnlocks, setUserUnlocks] = useState<FeatureKey[]>([]);
  const [savingUnlocks, setSavingUnlocks] = useState(false);

  // ── Platform Stats ────────────────────────────────────────────────────────
  const [platformStats, setPlatformStats] = useState<{ [k: string]: number }>({});
  const [recentUsers, setRecentUsers] = useState<any[]>([]);

  useEffect(() => {
    if (!isReg) { navigate('/'); return; }
    fetchEmployees();
    fetchPlatformStats();
    setLoading(false);
  }, [isReg]);

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase
      .from('employee_assignments')
      .select('*, user_profiles:user_id(id, username, avatar_url, verified, followers_count)')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    setEmployees(data ?? []);
  }, []);

  const fetchPlatformStats = useCallback(async () => {
    const [usersRes, postsRes, spacesRes] = await Promise.all([
      supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
      supabase.from('posts').select('*', { count: 'exact', head: true }),
      supabase.from('spaces').select('*', { count: 'exact', head: true }).eq('is_live', true),
    ]);
    setPlatformStats({
      users:      usersRes.count ?? 0,
      posts:      postsRes.count ?? 0,
      live_spaces: spacesRes.count ?? 0,
    });
    const { data: recent } = await supabase
      .from('user_profiles')
      .select('id, username, avatar_url, verified, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    setRecentUsers(recent ?? []);
  }, []);

  // ── Hire employee ─────────────────────────────────────────────────────────
  const searchUsersToHire = useCallback(async (q: string) => {
    if (!q.trim()) { setHireResults([]); return; }
    const { data } = await supabase
      .from('user_profiles')
      .select('id, username, avatar_url, verified, followers_count')
      .ilike('username', `${q}%`)
      .limit(8);
    setHireResults(data ?? []);
  }, []);

  const handleHire = useCallback(async () => {
    if (!selectedHireUser || !hireForm.job_title.trim() || !user) return;
    setHiring(true);
    const { error } = await supabase.from('employee_assignments').upsert({
      user_id:    selectedHireUser.id,
      job_title:  hireForm.job_title.trim(),
      department: hireForm.department,
      notes:      hireForm.notes.trim(),
      assigned_by: user.id,
      is_active:  true,
    }, { onConflict: 'user_id' });
    if (error) { toast.error(error.message); setHiring(false); return; }
    await supabase.from('platform_inbox').insert({
      user_id: selectedHireUser.id,
      subject: `🎉 You've been assigned a role on Testagram!`,
      body: `The Testagram regulator has assigned you the role of "${hireForm.job_title}" in the ${hireForm.department} department.${hireForm.notes ? '\n\nNote: ' + hireForm.notes : ''} Welcome to the team!`,
      type: 'update',
      icon_emoji: '🎉',
      cta_label: 'View your profile',
      cta_url: `/profile/${selectedHireUser.username}`,
    }).catch(() => {});
    toast.success(`@${selectedHireUser.username} hired as ${hireForm.job_title}!`);
    setShowHireDialog(false);
    setSelectedHireUser(null);
    setHireForm({ job_title: '', department: 'Engineering', notes: '' });
    setHireSearch('');
    setHireResults([]);
    setHiring(false);
    fetchEmployees();
  }, [selectedHireUser, hireForm, user, fetchEmployees]);

  const handleFire = useCallback(async (empId: string, username: string) => {
    if (!window.confirm(`Remove @${username} from employees?`)) return;
    await supabase.from('employee_assignments').update({ is_active: false }).eq('id', empId);
    toast.success(`@${username} removed from employees`);
    fetchEmployees();
  }, [fetchEmployees]);

  // ── Feature unlock management ─────────────────────────────────────────────
  const searchUsersToUnlock = useCallback(async (q: string) => {
    if (!q.trim()) { setUnlockResults([]); return; }
    const { data } = await supabase
      .from('user_profiles')
      .select('id, username, avatar_url, verified')
      .ilike('username', `${q}%`)
      .limit(8);
    setUnlockResults(data ?? []);
  }, []);

  const selectUnlockUser = useCallback(async (profile: any) => {
    setSelectedUnlockUser(profile);
    setUnlockResults([]);
    setUnlockSearch(profile.username);
    const { data } = await supabase
      .from('user_feature_unlocks')
      .select('feature_key')
      .eq('user_id', profile.id);
    setUserUnlocks((data ?? []).map((r: any) => r.feature_key as FeatureKey));
  }, []);

  const toggleFeature = (key: FeatureKey) => {
    setUserUnlocks(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const saveFeatureUnlocks = useCallback(async () => {
    if (!selectedUnlockUser || !user) return;
    setSavingUnlocks(true);
    // Delete all existing unlocks for this user
    await supabase.from('user_feature_unlocks').delete().eq('user_id', selectedUnlockUser.id);
    // Insert selected features
    if (userUnlocks.length > 0) {
      await supabase.from('user_feature_unlocks').insert(
        userUnlocks.map(fk => ({
          user_id:      selectedUnlockUser.id,
          feature_key:  fk,
          unlocked_by:  user.id,
        }))
      );
    }
    // Notify user
    await supabase.from('platform_inbox').insert({
      user_id: selectedUnlockUser.id,
      subject: userUnlocks.length > 0
        ? `🔓 ${userUnlocks.length} feature${userUnlocks.length !== 1 ? 's' : ''} unlocked for you!`
        : `🔒 Your platform features have been updated`,
      body: userUnlocks.length > 0
        ? `The platform regulator has unlocked the following features for you: ${userUnlocks.map(k => FEATURE_LABELS[k] ?? k).join(', ')}.`
        : `Your feature access has been updated by the platform regulator.`,
      type: 'update',
      icon_emoji: userUnlocks.length > 0 ? '🔓' : '🔒',
    }).catch(() => {});
    toast.success(`Features updated for @${selectedUnlockUser.username}`);
    setSavingUnlocks(false);
  }, [selectedUnlockUser, userUnlocks, user]);

  if (!isReg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 mx-auto text-destructive mb-4" />
          <h2 className="text-2xl font-black mb-2">Access Denied</h2>
          <p className="text-muted-foreground">This panel is restricted to platform regulators.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopBar title="Regulator Panel" showBack />

      {/* ── Hero ── */}
      <div className="bg-gradient-to-br from-violet-600/15 via-background to-primary/10 border-b border-border px-4 py-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-primary flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Crown className="w-6 h-6 text-white" fill="currentColor" />
          </div>
          <div>
            <h1 className="text-xl font-black">Platform Regulator</h1>
            <p className="text-xs text-muted-foreground">Full control · @{user?.username}</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-bold text-green-600">Active</span>
          </div>
        </div>
        {/* Platform stats */}
        <div className="flex gap-3 overflow-x-auto scrollbar-hide">
          {[
            { label: 'Users',      val: platformStats.users ?? 0,       icon: Users,    color: 'text-blue-500' },
            { label: 'Posts',      val: platformStats.posts ?? 0,       icon: BarChart3, color: 'text-primary' },
            { label: 'Live',       val: platformStats.live_spaces ?? 0, icon: Bell,     color: 'text-red-500' },
            { label: 'Employees',  val: employees.length,               icon: Briefcase, color: 'text-violet-500' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-xl shrink-0">
              <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
              <span className="text-xs font-black">{formatNumber(s.val)}</span>
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="sticky top-14 z-20 bg-background border-b border-border">
        <div className="flex">
          {[
            { key: 'employees', label: 'Employees', icon: Briefcase },
            { key: 'features',  label: 'Features',  icon: Unlock },
            { key: 'platform',  label: 'Platform',  icon: Settings },
            { key: 'reports',   label: 'Reports',   icon: TrendingUp },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as RegTab)}
              className={`flex-1 py-3 text-xs font-bold border-b-2 flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
              }`}>
              <t.icon className="w-3.5 h-3.5" />{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">

        {/* ── EMPLOYEES TAB ── */}
        {activeTab === 'employees' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-black text-base">Platform Employees</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Assign roles and jobs to users</p>
              </div>
              <button onClick={() => setShowHireDialog(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90">
                <UserPlus className="w-3.5 h-3.5" />Hire
              </button>
            </div>

            {employees.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Briefcase className="w-14 h-14 mx-auto mb-3 opacity-20" />
                <p className="font-semibold">No employees yet</p>
                <p className="text-sm mt-1">Hire users to assign them platform roles</p>
              </div>
            ) : (
              <div className="space-y-2">
                {employees.map((emp: any) => (
                  <div key={emp.id} className="flex items-center gap-3 p-3 bg-card border border-border rounded-2xl hover:border-primary/20 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-muted overflow-hidden shrink-0">
                      {emp.user_profiles?.avatar_url
                        ? <img src={emp.user_profiles.avatar_url} className="w-full h-full object-cover" alt="" />
                        : <div className="w-full h-full flex items-center justify-center font-bold">{emp.user_profiles?.username?.[0]?.toUpperCase()}</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-sm">@{emp.user_profiles?.username}</p>
                        {emp.user_profiles?.verified && <span className="text-[10px] text-primary font-bold">✓</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{emp.job_title} · {emp.department}</p>
                      {emp.notes && <p className="text-[10px] text-muted-foreground/70 truncate">{emp.notes}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] bg-violet-500/10 text-violet-600 font-bold px-2 py-0.5 rounded-full">{emp.department}</span>
                      <button onClick={() => handleFire(emp.id, emp.user_profiles?.username)}
                        className="text-[10px] text-destructive hover:underline">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Hire Dialog */}
            {showHireDialog && (
              <div className="fixed inset-0 z-[300] bg-black/60 flex items-end" onClick={() => setShowHireDialog(false)}>
                <div className="w-full bg-background rounded-t-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-lg">Hire Employee</h3>
                    <button onClick={() => setShowHireDialog(false)} className="p-2 rounded-full hover:bg-muted"><X className="w-4 h-4" /></button>
                  </div>
                  {/* User search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input type="text" value={hireSearch}
                      onChange={e => { setHireSearch(e.target.value); searchUsersToHire(e.target.value); }}
                      placeholder="Search username…"
                      className="w-full h-10 pl-9 pr-4 bg-muted/40 border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
                    {hireResults.length > 0 && (
                      <div className="absolute top-full mt-1 w-full bg-background border border-border rounded-xl shadow-xl z-10 overflow-hidden">
                        {hireResults.map((u: any) => (
                          <button key={u.id} onClick={() => { setSelectedHireUser(u); setHireSearch(u.username); setHireResults([]); }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted text-left">
                            <div className="w-7 h-7 rounded-full bg-muted overflow-hidden shrink-0">
                              {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-xs font-bold">{u.username?.[0]?.toUpperCase()}</div>}
                            </div>
                            <span className="text-sm font-semibold">@{u.username}</span>
                            {u.verified && <span className="text-[10px] text-primary">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedHireUser && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-xl">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      <span className="text-sm font-bold">@{selectedHireUser.username}</span>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-semibold mb-1 block">Job Title *</label>
                    <input type="text" value={hireForm.job_title}
                      onChange={e => setHireForm(p => ({ ...p, job_title: e.target.value }))}
                      placeholder="e.g. Content Moderator, Marketing Lead"
                      className="w-full h-10 px-3 bg-muted/40 border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="text-sm font-semibold mb-1 block">Department</label>
                    <div className="flex flex-wrap gap-2">
                      {DEPT_OPTIONS.map(d => (
                        <button key={d} onClick={() => setHireForm(p => ({ ...p, department: d }))}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${hireForm.department === d ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/30'}`}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-semibold mb-1 block">Notes (optional)</label>
                    <textarea value={hireForm.notes} onChange={e => setHireForm(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Responsibilities, special instructions…" rows={2} maxLength={300}
                      className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/30" />
                  </div>
                  <button onClick={handleHire} disabled={hiring || !selectedHireUser || !hireForm.job_title.trim()}
                    className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90">
                    {hiring ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    {hiring ? 'Hiring…' : 'Hire Employee'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── FEATURES TAB ── */}
        {activeTab === 'features' && (
          <div className="space-y-4">
            <div>
              <h2 className="font-black text-base">Feature Access Control</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Unlock platform features for specific users</p>
            </div>
            {/* User search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="text" value={unlockSearch}
                onChange={e => { setUnlockSearch(e.target.value); searchUsersToUnlock(e.target.value); }}
                placeholder="Search user to manage features…"
                className="w-full h-10 pl-9 pr-4 bg-muted/40 border border-border rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
              {unlockResults.length > 0 && (
                <div className="absolute top-full mt-1 w-full bg-background border border-border rounded-xl shadow-xl z-10 overflow-hidden">
                  {unlockResults.map((u: any) => (
                    <button key={u.id} onClick={() => selectUnlockUser(u)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted text-left">
                      <div className="w-7 h-7 rounded-full bg-muted overflow-hidden shrink-0">
                        {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-xs font-bold">{u.username?.[0]?.toUpperCase()}</div>}
                      </div>
                      <span className="text-sm font-semibold">@{u.username}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedUnlockUser ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-primary/5 border border-primary/20 rounded-xl">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-muted shrink-0">
                    {selectedUnlockUser.avatar_url ? <img src={selectedUnlockUser.avatar_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-xs font-bold">{selectedUnlockUser.username?.[0]?.toUpperCase()}</div>}
                  </div>
                  <span className="font-bold text-sm">@{selectedUnlockUser.username}</span>
                  <span className="text-xs text-muted-foreground ml-1">— {userUnlocks.length} features unlocked</span>
                  <button onClick={() => { setSelectedUnlockUser(null); setUnlockSearch(''); setUserUnlocks([]); }}
                    className="ml-auto text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                </div>
                <div className="space-y-2">
                  {FEATURE_KEYS.map(fk => {
                    const isOn = userUnlocks.includes(fk);
                    return (
                      <button key={fk} onClick={() => toggleFeature(fk)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                          isOn ? 'border-primary/30 bg-primary/5' : 'border-border hover:border-primary/20'
                        }`}>
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${isOn ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                          {isOn ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        </div>
                        <span className="font-semibold text-sm flex-1">{FEATURE_LABELS[fk] ?? fk}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isOn ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                          {isOn ? 'UNLOCKED' : 'LOCKED'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button onClick={saveFeatureUnlocks} disabled={savingUnlocks}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:opacity-90">
                  {savingUnlocks ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {savingUnlocks ? 'Saving…' : 'Save Feature Access'}
                </button>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Unlock className="w-14 h-14 mx-auto mb-3 opacity-20" />
                <p className="font-semibold">Search a user above</p>
                <p className="text-sm mt-1">Select a user to manage their platform feature access</p>
              </div>
            )}
          </div>
        )}

        {/* ── PLATFORM TAB ── */}
        {activeTab === 'platform' && (
          <div className="space-y-4">
            <h2 className="font-black text-base">Platform Overview</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total Users',   val: platformStats.users ?? 0,      color: 'from-blue-500/15', icon: '👥' },
                { label: 'Total Posts',   val: platformStats.posts ?? 0,      color: 'from-primary/15',  icon: '📝' },
                { label: 'Live Spaces',   val: platformStats.live_spaces ?? 0, color: 'from-red-500/15',  icon: '🔴' },
                { label: 'Employees',     val: employees.length,              color: 'from-violet-500/15', icon: '💼' },
              ].map(s => (
                <div key={s.label} className={`p-4 rounded-2xl bg-gradient-to-br ${s.color} to-transparent border border-border`}>
                  <p className="text-2xl font-black">{formatNumber(s.val)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.icon} {s.label}</p>
                </div>
              ))}
            </div>
            <div>
              <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Eye className="w-4 h-4 text-primary" />Recent Users</h3>
              <div className="space-y-2">
                {recentUsers.map((u: any) => (
                  <button key={u.id} onClick={() => navigate(`/profile/${u.username}`)}
                    className="w-full flex items-center gap-3 p-3 bg-card border border-border rounded-xl hover:border-primary/20 transition-colors text-left">
                    <div className="w-8 h-8 rounded-full bg-muted overflow-hidden shrink-0">
                      {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-xs font-bold">{u.username?.[0]?.toUpperCase()}</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm">@{u.username}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}</p>
                    </div>
                    {u.verified && <span className="text-[10px] text-primary font-bold shrink-0">✓ Verified</span>}
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2 pt-2">
              <h3 className="font-bold text-sm mb-2 flex items-center gap-2"><Settings className="w-4 h-4 text-primary" />Quick Links</h3>
              {[
                { label: 'Admin Panel',         path: '/admin' },
                { label: 'Admin Revenue',       path: '/admin/revenue' },
                { label: 'Fraud Detection',     path: '/fraud-detection' },
                { label: 'Admin Verifications', path: '/admin/verifications' },
                { label: 'Ad Config',           path: '/admin/ads' },
                { label: 'SEO Audit',           path: '/admin/seo' },
              ].map(l => (
                <button key={l.path} onClick={() => navigate(l.path)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-card border border-border rounded-xl text-sm hover:border-primary/20 transition-colors">
                  <span className="font-semibold">{l.label}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── REPORTS TAB ── */}
        {activeTab === 'reports' && (
          <div className="space-y-4">
            <h2 className="font-black text-base">Platform Reports</h2>
            <div className="space-y-2">
              {[
                { label: 'Post Reports',      icon: '⚠️', path: '/admin' },
                { label: 'Fraud Alerts',      icon: '🔍', path: '/fraud-detection' },
                { label: 'Ad Reviews',        icon: '📣', path: '/admin/ads-review' },
                { label: 'Revenue Analytics', icon: '💰', path: '/revenue-analytics' },
                { label: 'Post Analytics',    icon: '📊', path: '/post-analytics' },
                { label: 'Boost Analytics',   icon: '🚀', path: '/boost-analytics/all' },
              ].map(r => (
                <button key={r.path} onClick={() => navigate(r.path)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-xl hover:border-primary/20 transition-colors text-left">
                  <span className="text-xl shrink-0">{r.icon}</span>
                  <span className="font-semibold text-sm flex-1">{r.label}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
