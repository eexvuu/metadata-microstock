import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import type { MetadataRow, RunOptions } from '#/lib/engine/types'

interface ResultTableProps {
  rows: MetadataRow[]
  platform: RunOptions['platform']
}

export function ResultTable({ rows, platform }: ResultTableProps) {
  const fallbacks = rows.filter((row) => row.fallback).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="eyebrow text-muted-foreground">Rows written</CardTitle>
        <CardDescription>
          {rows.length} generated
          {fallbacks > 0 ? (
            <>
              {' · '}
              <span className="text-destructive">
                {fallbacks} fallback row{fallbacks === 1 ? '' : 's'} — the model
                gave nothing usable for those files
              </span>
            </>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border-(--line) overflow-x-auto border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-64">Filename</TableHead>
                <TableHead>{platform === 'adobe' ? 'Title' : 'Description'}</TableHead>
                <TableHead className="w-40">
                  {platform === 'adobe' ? 'Category' : 'Categories'}
                </TableHead>
                <TableHead className="w-20 text-right">Keywords</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.filename}>
                  <TableCell className="font-mono text-xs">
                    {row.filename}
                    {row.fallback ? (
                      <Badge variant="destructive" className="ml-2">
                        {row.fallback}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm whitespace-normal">
                    {platform === 'adobe' ? row.title : row.description}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {row.category}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {row.keywords ? row.keywords.split(',').length : 0}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
