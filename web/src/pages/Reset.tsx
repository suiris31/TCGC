import { useState } from 'react';
import { api } from '../api';
import { LangSwitch } from '../components/LangSwitch';
import { t } from '../i18n';
import { useApp } from '../store';

// Lien reçu par e-mail (#reset/<jeton>) : choix d'un nouveau mot de passe, puis connexion
export function ResetPage({ token }: { token: string }) {
  const { setUser, toast, uiLang, setUiLang } = useApp();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.resetPassword(token, password);
      setUser(user);
      window.location.hash = 'collection';
      toast(t('reset.done'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-lang">
        <LangSwitch value={uiLang} onChange={setUiLang} compact label={t('stats.uiLang')} />
      </div>
      <div className="auth-hero">
        <div className="auth-logo" aria-hidden="true">☠</div>
        <h1>{t('reset.title')}</h1>
        <p className="muted">{t('reset.text')}</p>
      </div>
      <div className="auth-card">
        <form className="auth-form" onSubmit={submit}>
          <label className="field">
            <span>{t('auth.password')}</span>
            <div className="password-row">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password" minLength={8} required autoFocus />
              <button type="button" className="link" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? t('auth.hide') : t('auth.show')}
              </button>
            </div>
            <small className="muted">{t('auth.passwordHint')}</small>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? '…' : t('reset.submit')}</button>
        </form>
        <a className="link center-link" href="#">{t('auth.backToLogin')}</a>
      </div>
    </div>
  );
}
