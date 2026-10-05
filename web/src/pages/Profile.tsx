import { useState } from 'react';
import { api, formatDate } from '../api';
import { Icon } from '../components/Icon';
import { LangSwitch } from '../components/LangSwitch';
import { NotificationsPanel } from '../components/NotificationsPanel';
import { LegalLink } from './Legal';
import { t } from '../i18n';
import { useApp } from '../store';

export function ProfilePage() {
  const { user, setUser, toast, uiLang, setUiLang } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const logout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
    toast(t('profile.loggedOut'));
  };

  // Suppression définitive du compte et de toutes ses données, après confirmation par mot de passe
  const deleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount(password);
      setUser(null);
      toast(t('profile.deleted'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page stats">
      <section className="panel">
        <h3>{t('profile.account')}</h3>
        <dl className="kv">
          <div><dt>{t('profile.pseudo')}</dt><dd>{user.pseudo}</dd></div>
          <div><dt>{t('profile.email')}</dt><dd>{user.email}</dd></div>
          <div><dt>{t('profile.since')}</dt><dd>{formatDate(user.createdAt)}</dd></div>
        </dl>
        <div className="panel-actions">
          <button className="btn btn-ghost" onClick={logout}>
            <Icon name="logout" size={18} /> {t('profile.logout')}
          </button>
        </div>
      </section>

      <section className="panel">
        <h3>{t('stats.uiLang')}</h3>
        {/* chaque langue est écrite dans sa propre langue, pour être reconnue quelle que soit la langue actuelle */}
        <LangSwitch value={uiLang} onChange={setUiLang} label={t('stats.uiLang')} names={{ fr: 'Français', en: 'English' }} />
      </section>

      <NotificationsPanel />

      <section className="panel panel-danger">
        <h3>{t('profile.delete')}</h3>
        <p className="muted small">{t('profile.deleteText')}</p>
        {!confirming ? (
          <button className="btn btn-danger" onClick={() => setConfirming(true)}>
            <Icon name="trash" size={18} /> {t('profile.delete')}
          </button>
        ) : (
          <form className="auth-form" onSubmit={deleteAccount}>
            <label className="field">
              <span>{t('profile.deleteConfirm')}</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password" required autoFocus />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="panel-actions">
              <button type="button" className="btn btn-ghost" onClick={() => { setConfirming(false); setPassword(''); setError(null); }}>
                {t('profile.cancel')}
              </button>
              <button type="submit" className="btn btn-danger" disabled={busy || !password}>
                {busy ? '…' : t('profile.deleteButton')}
              </button>
            </div>
          </form>
        )}
      </section>
      <LegalLink />
    </div>
  );
}
