import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { Modal } from './Modal';
import { api, today } from './lib';

function moveMonth(month: string, step: number) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + step);
  return date.toISOString().slice(0, 7);
}
export function DateCalendar({
  date,
  onSelect,
  onClose,
}: {
  date: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(date.slice(0, 7));
  const [counts, setCounts] = useState<Record<string, number>>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setCounts(undefined);
    setError('');
    api<Record<string, number>>(`/api/entry-dates?month=${month}`, { signal: controller.signal })
      .then(setCounts)
      .catch((error) => {
        if (error.name !== 'AbortError') setError(error.message);
      });
    return () => controller.abort();
  }, [month, revision]);
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return (
    <Modal title="翻到哪一天？" onClose={onClose} className="calendar-modal">
      <div className="calendar-month">
        <button
          className="icon-button"
          aria-label="上个月"
          onClick={() => setMonth(moveMonth(month, -1))}
        >
          <ChevronLeft size={20} />
        </button>
        <label className="calendar-month-picker">
          <span aria-hidden="true">
            {month.slice(0, 4)} 年 {Number(month.slice(5))} 月 <ChevronDown size={14} />
          </span>
          <input
            type="month"
            aria-label="选择月份"
            value={month}
            max={today().slice(0, 7)}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker?.();
              } catch {
                /* Native input remains available. */
              }
            }}
            onChange={(e) => {
              if (/^\d{4}-\d{2}$/.test(e.target.value) && e.target.value <= today().slice(0, 7))
                setMonth(e.target.value);
            }}
          />
        </label>
        <button
          className="icon-button"
          aria-label="下个月"
          disabled={month >= today().slice(0, 7)}
          onClick={() => setMonth(moveMonth(month, 1))}
        >
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">
        {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="calendar-days" role="group" aria-label={`${month}的日期`}>
        {Array.from({ length: 42 }, (_, index) => {
          const day = index - offset + 1;
          if (day < 1 || day > days) return <span key={index} />;
          const value = `${month}-${String(day).padStart(2, '0')}`;
          const count = counts?.[value] || 0;
          return (
            <button
              key={index}
              disabled={value > today()}
              aria-pressed={value === date}
              aria-current={value === today() ? 'date' : undefined}
              aria-label={`${value}，${counts ? (count ? `${count} 个瞬间` : '暂无记录') : '记录数量未加载'}`}
              onClick={() => onSelect(value)}
            >
              <span>{day}</span>
              <i aria-hidden="true" className={count ? 'has-records' : ''} />
            </button>
          );
        })}
      </div>
      <div className="calendar-status" role="status">
        {error ? (
          <>
            <span>记录标记加载失败</span>
            <button className="text-button" onClick={() => setRevision((n) => n + 1)}>
              重试
            </button>
          </>
        ) : !counts ? (
          '正在查看这个月的记录…'
        ) : (
          <>
            <i className="has-records" />
            有瞬间的日子 · 北京时间
          </>
        )}
      </div>
      <button className="secondary full" onClick={() => onSelect(today())}>
        回到今天
      </button>
    </Modal>
  );
}
