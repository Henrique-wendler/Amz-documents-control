import type { ReactNode } from "react";

interface SectionCardProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function SectionCard({ title, subtitle, action, className = "", children }: SectionCardProps) {
  return (
    <section className={`section-card ${className}`}>
      <div className="section-card__header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {action ? <div className="section-card__header-action">{action}</div> : null}
      </div>
      <div className="section-card__body">{children}</div>
    </section>
  );
}
