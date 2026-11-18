import React, { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Check,
  Cloud,
  Flame,
  LogIn,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Sun,
  UploadCloud,
  X,
} from 'lucide-react';
import { StudyView, UserSettings } from '../types';

export type CloudSyncStatus = 'local' | 'syncing' | 'synced' | 'error';

interface TopBarProps {
  activeView: StudyView;
  onNavigate: (view: StudyView) => void;
  streak: number;
  todayProgressText: string;
  settings: UserSettings;
  onToggleTheme: () => void;
  onQuickPractice: () => void;
  user: User | null;
  authReady: boolean;
  authBusy: boolean;
  syncStatus: CloudSyncStatus;
  onSignIn: () => void;
  onSignOut: () => void;
  onUploadLocalToCloud: () => void;
}

const NAV_ITEMS: Array<{ id: StudyView; label: string }> = [
  { id: 'decks', label: 'Decks' },
  { id: 'kanji-dict', label: 'Kanji Dictionary' },
  { id: 'word-dict', label: 'Word Dictionary' },
  { id: 'practice', label: 'Practice' },
  { id: 'stats', label: 'Progress' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  onNavigate,
  streak,
  todayProgressText,
  settings,
  onToggleTheme,
  onQuickPractice,
  user,
  authReady,
  authBusy,
  syncStatus,
  onSignIn,
  onSignOut,
  onUploadLocalToCloud,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setAvatarFailed(false);
  }, [user?.photoURL]);

  // Close menus on Escape key
  useEffect(() => {
    if (!mobileMenuOpen && !accountMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        setAccountMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, accountMenuOpen]);

  // Close account popover when clicking outside
  useEffect(() => {
    if (!accountMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(e.target as Node)
      ) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [accountMenuOpen]);

  // Close mobile drawer when viewport widens to desktop
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMobileMenuOpen(false);
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const handleSelectNav = (view: StudyView) => {
    onNavigate(view);
    setMobileMenuOpen(false);
    setAccountMenuOpen(false);
  };

  const userInitial = (
    user?.displayName?.trim().charAt(0) ||
    user?.email?.trim().charAt(0) ||
    'K'
  ).toUpperCase();

  const shortName =
    user?.displayName?.trim().split(/\s+/)[0] ||
    user?.email?.split('@')[0] ||
    'Account';

  const syncLabel =
    syncStatus === 'syncing'
      ? 'Syncing to cloud...'
      : syncStatus === 'error'
        ? 'Sync needs attention'
        : 'Synced across devices';

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-[#FAF9F6]/95 dark:bg-[#121316]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 xl:gap-8 px-4 sm:px-6 h-16">
        {/* Zone 1: Single-line Brand wordmark */}
        <button
          type="button"
          onClick={() => handleSelectNav('decks')}
          className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600 cursor-pointer"
        >
          Kakuso
        </button>

        {/* Zone 2: Desktop single-line navigation links (no horizontal scrollbars) */}
        <nav
          aria-label="Primary navigation"
          className="hidden lg:flex items-center gap-5 xl:gap-7"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectNav(item.id)}
                className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                  isActive
                    ? 'text-zinc-950 dark:text-white'
                    : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[1px] h-0.5 bg-emerald-600 dark:bg-emerald-400"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Utilities + Google Account + Primary Action + Mobile Hamburger */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => handleSelectNav('stats')}
            title={`Current streak: ${streak} day${streak === 1 ? '' : 's'} · Today: ${todayProgressText}`}
            className="hidden xl:inline-flex items-center gap-1.5 mr-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Flame
              className={`h-4 w-4 ${
                streak > 0
                  ? 'text-amber-500 fill-amber-500/20'
                  : 'text-zinc-400 dark:text-zinc-500'
              }`}
              aria-hidden="true"
            />
            <span className="font-mono-num font-semibold">{streak}d</span>
            <span className="text-zinc-400 dark:text-zinc-500" aria-hidden="true">
              ·
            </span>
            <span className="font-mono-num text-zinc-500 dark:text-zinc-400">
              {todayProgressText}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={
              settings.theme === 'dark'
                ? 'Switch to Washi Light Mode'
                : 'Switch to Sumi Dark Mode'
            }
            title={
              settings.theme === 'dark'
                ? 'Switch to Washi Light Mode'
                : 'Switch to Sumi Dark Mode'
            }
            className="inline-flex h-10 w-10 lg:h-9 lg:w-9 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 transition-colors shrink-0 cursor-pointer"
          >
            {settings.theme === 'dark' ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          {/* Google Account control */}
          {authReady && (
            <div ref={accountMenuRef} className="relative shrink-0">
              {user ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen((v) => !v);
                      setMobileMenuOpen(false);
                    }}
                    aria-expanded={accountMenuOpen}
                    aria-haspopup="menu"
                    title={`${user.displayName || user.email || 'Google Account'} · ${syncLabel}`}
                    className="inline-flex h-10 lg:h-9 items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] px-2 sm:px-2.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {user.photoURL && !avatarFailed ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'Google account avatar'}
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarFailed(true)}
                        className="h-5 w-5 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-semibold text-white shrink-0">
                        {userInitial}
                      </span>
                    )}
                    <span className="hidden sm:inline max-w-[84px] truncate">
                      {shortName}
                    </span>
                    {syncStatus === 'syncing' ? (
                      <RefreshCw
                        className="hidden sm:block h-3.5 w-3.5 animate-spin text-zinc-400"
                        aria-hidden="true"
                      />
                    ) : (
                      <Cloud
                        className={`hidden sm:block h-3.5 w-3.5 ${
                          syncStatus === 'error'
                            ? 'text-amber-500'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                        aria-hidden="true"
                      />
                    )}
                  </button>

                  {accountMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-64 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] p-3 shadow-lg space-y-2.5 z-50"
                    >
                      <div className="border-b border-zinc-200/80 dark:border-zinc-800 pb-2.5 space-y-0.5">
                        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {user.displayName || 'Google Account'}
                        </p>
                        {user.email && (
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                            {user.email}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 pt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                          {syncStatus === 'syncing' ? (
                            <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
                          ) : (
                            <Check className="h-3 w-3" aria-hidden="true" />
                          )}
                          <span>{syncLabel}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        role="menuitem"
                        disabled={syncStatus === 'syncing'}
                        onClick={() => {
                          onUploadLocalToCloud();
                          setAccountMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <UploadCloud className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
                        Sync local decks to cloud
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        disabled={authBusy}
                        onClick={() => {
                          setAccountMenuOpen(false);
                          onSignOut();
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                        Sign out
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={onSignIn}
                  title="Sign in with Google to sync your decks and progress across devices"
                  className="inline-flex h-10 lg:h-9 items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] px-2.5 sm:px-3 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogIn className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span className="hidden sm:inline">
                    {authBusy ? 'Signing in...' : 'Sign in'}
                  </span>
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              onQuickPractice();
            }}
            className="hidden sm:inline-flex px-3.5 py-2 text-xs font-semibold rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Start Practice
          </button>

          {/* Mobile / Tablet Hamburger Toggle */}
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen((v) => !v);
              setAccountMenuOpen(false);
            }}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav-drawer"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 transition-colors shrink-0 cursor-pointer"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Reactive Mobile / Tablet Hamburger Drawer */}
      {mobileMenuOpen && (
        <div
          id="mobile-nav-drawer"
          className="lg:hidden border-t border-zinc-200/80 dark:border-zinc-800 bg-[#FAF9F6] dark:bg-[#121316]"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 space-y-4">
            <nav aria-label="Mobile navigation" className="grid grid-cols-1 gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectNav(item.id)}
                    className={`flex min-h-[44px] w-full items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-emerald-600/10 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300 font-semibold'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/70'
                    }`}
                  >
                    <span>{item.label}</span>
                    {isActive && (
                      <Check
                        className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="flex items-center justify-between border-t border-zinc-200/80 dark:border-zinc-800 pt-3">
              <button
                type="button"
                onClick={() => handleSelectNav('stats')}
                className="inline-flex min-h-[40px] items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer"
              >
                <Flame
                  className={`h-4 w-4 ${
                    streak > 0
                      ? 'text-amber-500 fill-amber-500/20'
                      : 'text-zinc-400 dark:text-zinc-500'
                  }`}
                  aria-hidden="true"
                />
                <span className="font-mono-num font-semibold">{streak}d streak</span>
                <span className="text-zinc-400" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono-num text-zinc-500 dark:text-zinc-400">
                  Today {todayProgressText}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onQuickPractice();
                }}
                className="sm:hidden inline-flex min-h-[40px] items-center rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-semibold text-white dark:text-zinc-950 cursor-pointer"
              >
                Start Practice
              </button>
            </div>

            {authReady && (
              <div className="border-t border-zinc-200/80 dark:border-zinc-800 pt-3">
                {user ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {user.displayName || 'Google Account'}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                        {user.email ? `${user.email} · ` : ''}
                        {syncLabel}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={syncStatus === 'syncing'}
                        onClick={() => {
                          onUploadLocalToCloud();
                          setMobileMenuOpen(false);
                        }}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 cursor-pointer"
                      >
                        <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
                        Sync local
                      </button>
                      <button
                        type="button"
                        disabled={authBusy}
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onSignOut();
                        }}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 cursor-pointer"
                      >
                        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                        Sign out
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={authBusy}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onSignIn();
                    }}
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#191B20] px-4 py-2.5 text-xs font-semibold text-zinc-800 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    <LogIn className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    <span>
                      {authBusy
                        ? 'Signing in with Google...'
                        : 'Sign in with Google to sync across devices'}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
