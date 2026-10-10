import { useState, useRef, useEffect } from 'react';
import { User, Bell, Shield, Palette, Key, Camera, Save, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUserProfile } from '../contexts/UserProfileContext';
import { supabase } from '../lib/supabase';

export default function SettingsPage() {
  const { user } = useAuth();
  const { profile, loading, updateProfile, uploadAvatar } = useUserProfile();
  const [activeTab, setActiveTab] = useState('profile');
  const [displayName, setDisplayName] = useState('');
  const [language, setLanguage] = useState('en');
  const [theme, setTheme] = useState('dark');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'zh', name: '中文' },
    { code: 'ja', name: '日本語' },
    { code: 'ko', name: '한국어' },
  ];

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setLanguage(profile.language || 'en');
      setTheme(profile.theme || 'dark');
      setEmailNotifications(profile.email_notifications ?? true);
      setPushNotifications(profile.push_notifications ?? false);
      if (profile.avatar_url) {
        setAvatarPreview(profile.avatar_url);
      }
    }
  }, [profile]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setAvatarPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload
    setSaving(true);
    const url = await uploadAvatar(file);
    if (url) {
      setAvatarPreview(url);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateProfile({
        display_name: displayName,
        language,
        theme,
        email_notifications: emailNotifications,
        push_notifications: pushNotifications,
      });

      // Apply theme
      if (theme === 'light') {
        document.documentElement.classList.add('light-theme');
      } else {
        document.documentElement.classList.remove('light-theme');
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Error saving profile:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!newPassword) {
      setPasswordError('New password is required.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'profile', icon: User, label: 'Profile' },
    { id: 'notifications', icon: Bell, label: 'Notifications' },
    { id: 'security', icon: Shield, label: 'Security' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ember-500" />
      </div>
    );
  }

  return (
    <div className="relative space-y-6">
      <div className="grid-bg grid-bg-fade pointer-events-none absolute inset-0 -z-10" />
      <div>
        <h1 className="font-display text-3xl font-semibold text-parchment">Settings</h1>
        <p className="text-ash mt-1">Manage your account and preferences</p>
      </div>

      <div className="flex gap-6">
        <div className="w-64 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-ember-600 text-parchment'
                    : 'text-ash hover:bg-ink-700 hover:text-parchment'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 bg-ink-800 rounded-xl border border-ink-700 p-6">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold text-parchment">Profile Settings</h2>
                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-ember-600 hover:bg-ember-700 text-parchment rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : saved ? (
                    <>
                      <Check className="w-4 h-4" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-parchment-300 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="w-full px-4 py-2 bg-ink-800 border border-ink-700 rounded-lg text-ash"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-parchment-300 mb-2">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter display name"
                    className="w-full px-4 py-2 bg-ink-800 border border-ink-700 rounded-lg text-parchment placeholder-ash/60 focus:outline-none focus:border-ember-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold text-parchment">Notification Preferences</h2>
                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-ember-600 hover:bg-ember-700 text-parchment rounded-lg transition-colors disabled:opacity-50"
                >
                  {saved ? (
                    <>
                      <Check className="w-4 h-4" />
                      Saved
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-ink-800 rounded-lg">
                  <div>
                    <p className="text-parchment font-medium">Email Notifications</p>
                    <p className="text-ash text-sm">Receive updates about your documents and projects</p>
                  </div>
                  <button
                    onClick={() => setEmailNotifications(!emailNotifications)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      emailNotifications ? 'bg-ember-600' : 'bg-ink-700'
                    }`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      emailNotifications ? 'right-1' : 'left-1'
                    }`}></div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <h2 className="font-display text-xl font-semibold text-parchment">Security Settings</h2>

                <div className="p-4 bg-ink-800 rounded-lg space-y-4">
                  <h3 className="text-parchment font-medium">Change Password</h3>
                  <div className="space-y-3">
                    {passwordError && (
                      <div className="text-red-400 text-sm">{passwordError}</div>
                    )}
                    {passwordSuccess && (
                      <div className="text-green-400 text-sm">Password updated successfully.</div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-parchment-300 mb-2">
                        New Password
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        className="w-full px-4 py-2 bg-ink-800 border border-ink-700 rounded-lg text-parchment placeholder-ash/60 focus:outline-none focus:border-ember-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-parchment-300 mb-2">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        className="w-full px-4 py-2 bg-ink-800 border border-ink-700 rounded-lg text-parchment placeholder-ash/60 focus:outline-none focus:border-ember-500"
                      />
                    </div>
                    <button
                      onClick={handleUpdatePassword}
                      disabled={saving}
                      className="px-6 py-2 bg-ember-600 hover:bg-ember-700 text-parchment rounded-lg transition-colors disabled:opacity-50"
                    >
                      {saving ? 'Updating...' : 'Update Password'}
                    </button>
                  </div>
                </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
