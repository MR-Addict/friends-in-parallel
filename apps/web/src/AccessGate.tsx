import { Icon as IslandIcon, Button, Card, Input, Title } from 'animal-island-ui';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, KeyRound } from 'lucide-react';
import { IslandScene } from './IslandScene';

import { accessCode } from './config/app.json';
const cookieName = 'parallel_access';
const weekSeconds = 7 * 24 * 60 * 60;
function readExpiry() {
  const value = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${cookieName}=`))
    ?.split('=')[1];
  const expiry = Number(value);
  return Number.isFinite(expiry) && expiry > Date.now() && expiry <= Date.now() + weekSeconds * 1000
    ? expiry
    : 0;
}

export function AccessGate({ children }: { children: ReactNode }) {
  const [expiry, setExpiry] = useState(() => (accessCode ? readExpiry() : 0));
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!expiry) return;
    const check = () => setExpiry(readExpiry());
    const timer = window.setTimeout(check, Math.max(0, expiry - Date.now()));
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [expiry]);

  function unlock(event: FormEvent) {
    event.preventDefault();
    if (!accessCode || code !== accessCode) {
      setError('暗号不对，再试一次吧。');
      return;
    }
    const until = Date.now() + weekSeconds * 1000;
    document.cookie = `${cookieName}=${until}; Max-Age=${weekSeconds}; Expires=${new Date(until).toUTCString()}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    const saved = readExpiry();
    if (!saved) {
      setError('请允许此网站使用 Cookie，然后重试。');
      return;
    }
    setCode('');
    setError('');
    setExpiry(saved);
  }

  if (expiry) return children;
  return (
    <main className="access-shell">
      <a className="brand" href="/">
        和朋友的同一时间
      </a>
      <div className="access-welcome">
        <Title size="small" color="app-yellow">
          欢迎来到我们的日常小岛
        </Title>
        <IslandScene />
        <p>收集每一个「想分享给你」的瞬间。</p>
      </div>
      <Card className="access-card">
        <span className="access-symbol">
          <IslandIcon icon={KeyRound} size={28} />
        </span>
        <p className="access-eyebrow">朋友们的平行生活手账</p>
        <h1>对个暗号，再一起翻开。</h1>
        <p className="muted">同一时间，看看朋友们都在干嘛。</p>
        {accessCode ? (
          <form onSubmit={unlock}>
            <label className="field-label" htmlFor="access-code">
              访问暗号
            </label>
            <Input
              id="access-code"
              className="island-access-input"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setError('');
              }}
              placeholder="输入朋友分享给你的暗号"
              aria-invalid={!!error}
              aria-describedby={error ? 'access-error access-help' : 'access-help'}
            />
            {error && (
              <p id="access-error" className="error-banner" role="alert">
                {error}
              </p>
            )}
            <Button type="primary" className="primary full island-action" htmlType="submit">
              翻开手账 <IslandIcon icon={ArrowRight} size={18} />
            </Button>
            <p id="access-help" className="access-help">
              这台设备会记住你 7 天。
            </p>
          </form>
        ) : (
          <p className="error-banner" role="alert">
            访问暗号尚未设置，请联系手账的主人。
          </p>
        )}
      </Card>
    </main>
  );
}
