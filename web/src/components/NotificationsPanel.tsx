import { useEffect, useState } from 'react';
import { api, type NotifyPrefs } from '../api';
import { t } from '../i18n';
import { currentSubscription, disablePush, enablePush, pushSupported } from '../push';
import { useApp } from '../store';
import { Icon } from './Icon';
import { Toggle } from './Toggle';

// Profil : notifications sur cet appareil (activation, types reçus, test)
export function NotificationsPanel() {
  const { toast } = useApp();
  const supported = pushSupported();
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const denied = supported && Notification.permission === 'denied';

  useEffect(() => {
    if (!supported) return;
    currentSubscription().then((sub) => setSubscribed(Boolean(sub))).catch(() => setSubscribed(false));
    api.push().then((res) => { setPrefs(res.prefs); setPublicKey(res.publicKey); }).catch(() => {});
  }, [supported]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const enable = () => run(async () => {
    if (!publicKey) return;
    if (await enablePush(publicKey)) {
      setSubscribed(true);
      toast(t('notify.enabledToast'));
    } else {
      toast(t('notify.denied'));
    }
  });

  const changePref = (type: keyof NotifyPrefs, value: boolean) => run(async () => {
    setPrefs((await api.setNotifyPrefs({ [type]: value })).notify);
  });

  return (
    <section className="panel stack-tight">
      <h3 className="flush">{t('notify.title')}</h3>
      {!supported ? (
        <p className="muted small flush">{t('notify.unsupported')}</p>
      ) : denied ? (
        <p className="muted small flush">{t('notify.denied')}</p>
      ) : subscribed === null ? null : !subscribed ? (
        <>
          <p className="muted small flush">{t('notify.intro')}</p>
          <button className="btn btn-primary" onClick={enable} disabled={busy || !publicKey}>
            <Icon name="bell" size={18} /> {t('notify.enable')}
          </button>
        </>
      ) : (
        <>
          <div className="wish-status-ok"><Icon name="check" size={16} /> {t('notify.enabled')}</div>
          {prefs && (
            <>
              <Toggle checked={prefs.targets} disabled={busy} onChange={(v) => changePref('targets', v)}>{t('notify.targets')}</Toggle>
              <Toggle checked={prefs.weekly} disabled={busy} onChange={(v) => changePref('weekly', v)}>{t('notify.weekly')}</Toggle>
            </>
          )}
          <p className="muted small flush">{t('notify.when')}</p>
          <div className="panel-actions">
            <button className="btn btn-ghost" disabled={busy}
              onClick={() => run(async () => { const { sent } = await api.pushTest(); toast(t(sent ? 'notify.testSent' : 'notify.testNone')); })}>
              {t('notify.test')}
            </button>
            <button className="btn btn-ghost" disabled={busy}
              onClick={() => run(async () => { await disablePush(); setSubscribed(false); toast(t('notify.disabledToast')); })}>
              {t('notify.disable')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
