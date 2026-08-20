import { Outlet, createFileRoute } from '@tanstack/react-router'

/**
 * The tool shell.
 *
 * A tool gets the whole page: no sidebar, no dashboard chrome, and a much
 * wider measure than the account screens — the work is a contact sheet and a
 * table of rows, and both want the room.
 */
export const Route = createFileRoute('/tools')({
  component: ToolsLayout,
})

function ToolsLayout() {
  return (
    <div className="mx-auto w-full max-w-[100rem] px-4 py-6 sm:px-8">
      <Outlet />
    </div>
  )
}
