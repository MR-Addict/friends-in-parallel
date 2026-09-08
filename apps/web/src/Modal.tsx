import { Icon as IslandIcon, Button } from 'animal-island-ui';
import { useEffect, useRef, type MutableRefObject, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  busy = false,
  className = '',
  cancelGuard,
  headerActions,
}: {
  title: string;
  headerActions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  busy?: boolean;
  className?: string;
  cancelGuard?: MutableRefObject<boolean>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    const viewport = window.visualViewport;
    let frame = 0;
    const revealInput = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const active = document.activeElement;
        if (
          active instanceof HTMLElement &&
          el.contains(active) &&
          active.matches('input, textarea')
        ) {
          active.scrollIntoView({ block: 'nearest' });
        }
      });
    };
    el.addEventListener('focusin', revealInput);
    const resize = () => {
      el.style.setProperty('--viewport-height', `${viewport?.height || window.innerHeight}px`);
      el.style.setProperty('--viewport-top', `${viewport?.offsetTop || 0}px`);
      revealInput();
    };
    resize();
    window.addEventListener('resize', resize);
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('focusin', revealInput);
      window.removeEventListener('resize', resize);
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      el.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      className={`sheet-modal ${wide ? 'wide' : ''} ${className}`}
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (cancelGuard?.current) {
          cancelGuard.current = false;
          return;
        }
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
    >
      <div className="sheet-inner">
        <header className="sheet-heading">
          <h2>{title}</h2>
          <div className="sheet-heading-actions">
            {headerActions}
            <Button
              type="text"
              className="island-control icon-button"
              aria-label="关闭"
              onClick={onClose}
              disabled={busy}
            >
              <IslandIcon icon={X} size={21} />
            </Button>
          </div>
        </header>
        <div className="sheet-content">{children}</div>
      </div>
    </dialog>
  );
}
