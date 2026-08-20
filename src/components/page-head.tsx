/**
 * The heading block every dashboard tool screen opens with — index label, a
 * display-face title, and one line of prose under a hairline.
 */
export function PageHead({
  index,
  title,
  children,
  action,
}: {
  index: string
  title: string
  children?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <header className="border-(--line) border-b pb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-primary">{index}</p>
          <h1 className="font-display mt-2 text-3xl leading-none font-light tracking-tight">
            {title}
          </h1>
        </div>
        {action}
      </div>

      {children ? (
        <div className="text-muted-foreground mt-4 max-w-3xl text-sm text-pretty">
          {children}
        </div>
      ) : null}
    </header>
  )
}
