import type * as React from "react"

type Crumb = { href?: string; label: string; external?: boolean }

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: Crumb[]
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <header className="border-b pb-6">
      {eyebrow && eyebrow.length > 0 ? (
        <div className="text-xs tracking-wider text-muted-foreground uppercase">
          {eyebrow.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`}>
              {index > 0 ? <span className="mx-2">/</span> : null}
              {crumb.href ? (
                <a
                  href={crumb.href}
                  target={crumb.external ? "_blank" : undefined}
                  rel={crumb.external ? "noreferrer" : undefined}
                  className="underline decoration-border underline-offset-4 hover:text-foreground"
                >
                  {crumb.label}
                </a>
              ) : (
                <span>{crumb.label}</span>
              )}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        {children ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {children}
          </div>
        ) : null}
      </div>
      {description ? (
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
    </header>
  )
}
