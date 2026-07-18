'use client';

import { Icon, type IconName } from '../../icons';

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="apg-empty">
      <div className="apg-empty__card">
        {icon ? (
          <span style={{ color: 'var(--apg-text-tertiary)' }}>
            <Icon name={icon} size={42} />
          </span>
        ) : null}
        <div className="apg-empty__title" style={{ fontSize: 26 }}>
          {title}
        </div>
        {subtitle ? <div className="apg-empty__subtitle">{subtitle}</div> : null}
        {action ? (
          <button type="button" className="apg-btn" onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
