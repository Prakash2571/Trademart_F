'use client';

/**
 * Storefront diagnostics.
 *
 * READ-ONLY, and capability-driven rather than hardcoded: every control is
 * rendered from what GET /api/storefront/status reports the backend can
 * actually do. Theme editing is not implemented, so no editing control appears
 * here at all.
 *
 * That distinction is deliberate. A greyed-out "Edit theme" button would imply
 * the feature exists and is merely blocked by a permission, sending someone to
 * grant write_themes - which would not help, because there is no theme-write
 * code, and Shopify additionally gates theme file writes behind a per-app
 * exemption. The page says so in words instead.
 */

import { useState } from 'react';

import { Badge, Callout, Card, EmptyState, ErrorState, PageHeader } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { useApi } from '@/hooks/useApi';
import { ApiError, apiGet } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { StorefrontStatus, ThemeDto, ThemeFileDto } from '@/lib/types';

/** Files worth offering by default - the ones that carry theme settings. */
const SUGGESTED_FILES = [
  'config/settings_data.json',
  'templates/product.json',
  'templates/index.json',
  'layout/theme.liquid',
];

export default function StorefrontPage() {
  return (
    <>
      <PageHeader
        title="Storefront"
        description="Theme diagnostics for the connected Shopify store. Read-only: Trademart never modifies the live theme."
      />
      <StorefrontConsole />
    </>
  );
}

function StorefrontConsole() {
  const status = useApi<StorefrontStatus>('/storefront/status');
  const themes = useApi<{ themes: ThemeDto[] }>('/shopify/themes');

  if (status.error !== null && status.error.isConfigurationProblem) {
    return (
      <Card title="Storefront">
        <ErrorState error={status.error} onRetry={status.refetch} />
      </Card>
    );
  }

  return (
    <div className="stack">
      <CapabilityCard status={status} />
      <ThemeListCard themes={themes} />
      <ThemeFileReader
        themes={themes.data?.themes ?? []}
        enabled={status.data?.capabilities.readThemeFiles ?? false}
      />
    </div>
  );
}

/* ----------------------------------------------------------- capabilities -- */

function CapabilityCard({
  status,
}: {
  status: ReturnType<typeof useApi<StorefrontStatus>>;
}) {
  const { data, loading, error, refetch } = status;

  if (loading && data === null) {
    return (
      <Card title="Capabilities">
        <p className="muted">Loading…</p>
      </Card>
    );
  }
  if (error !== null) {
    return (
      <Card title="Capabilities">
        <ErrorState error={error} onRetry={refetch} />
      </Card>
    );
  }
  if (data === null) return null;

  // Split by WHY, not just by value: an unimplemented capability and a
  // permission-blocked one need completely different responses from the reader.
  const supported = Object.entries(data.capabilities).filter(([, value]) => value);
  const unsupported = Object.entries(data.capabilities).filter(([, value]) => !value);

  return (
    <Card title="Capabilities">
      <div className="stack">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {supported.map(([name]) => (
            <Badge key={name} tone="success" dot>
              {name}
            </Badge>
          ))}
          {unsupported.map(([name]) => (
            <Badge key={name} tone="neutral">
              {name}: no
            </Badge>
          ))}
        </div>

        <p className="muted">
          Requires the <span className="mono">{data.requiredScope}</span> scope.
        </p>

        {data.liveThemeError !== null && (
          <Callout tone="warning" title="Could not read the live theme">
            {data.liveThemeError}
          </Callout>
        )}

        <Callout tone="info" title="Theme editing is not implemented">
          {data.note}
        </Callout>

        {data.liveTheme !== null && (
          <p className="muted">
            Live theme: <strong>{data.liveTheme.name}</strong>{' '}
            <span className="mono">{data.liveTheme.id}</span>
          </p>
        )}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------- theme list -- */

function ThemeListCard({ themes }: { themes: ReturnType<typeof useApi<{ themes: ThemeDto[] }>> }) {
  const columns: Column<ThemeDto>[] = [
    {
      key: 'name',
      header: 'Theme',
      render: (row) => (
        <span className={row.live ? 'table__strong' : undefined}>{row.name}</span>
      ),
    },
    {
      key: 'live',
      header: 'Role',
      render: (row) =>
        row.live ? (
          <Badge tone="success" dot>
            live
          </Badge>
        ) : (
          <Badge tone="neutral">{row.role ?? 'unpublished'}</Badge>
        ),
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      render: (row) => (row.updatedAt ? formatDateTime(row.updatedAt) : '—'),
    },
    { key: 'id', header: 'ID', render: (row) => <span className="mono truncate">{row.id}</span> },
  ];

  return (
    <Card title="Themes">
      <DataTable
        columns={columns}
        rows={themes.data?.themes ?? null}
        loading={themes.loading}
        error={themes.error}
        onRetry={themes.refetch}
        getRowKey={(row) => row.id}
        emptyTitle="No themes returned"
        emptyDescription="The store reported no themes, or read_themes is not granted."
      />
    </Card>
  );
}

/* ------------------------------------------------------------ file reader -- */

function ThemeFileReader({
  themes,
  enabled,
}: {
  themes: ThemeDto[];
  enabled: boolean;
}) {
  const live = themes.find((theme) => theme.live) ?? themes[0] ?? null;
  const [themeId, setThemeId] = useState<string>('');
  const [filenames, setFilenames] = useState<string>(SUGGESTED_FILES[0] ?? '');
  const [files, setFiles] = useState<ThemeFileDto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Capability-driven: the reader is not rendered at all when the backend says
  // it cannot read theme files.
  if (!enabled) {
    return (
      <Card title="Theme files">
        <EmptyState
          title="Reading theme files is unavailable"
          description="The backend reports readThemeFiles: false for this store."
        />
      </Card>
    );
  }

  const selected = themeId !== '' ? themeId : (live?.id ?? '');

  const read = async () => {
    if (selected === '') return;
    setBusy(true);
    setError(null);
    try {
      const encoded = encodeURIComponent(selected);
      const response = await apiGet<{ files: ThemeFileDto[] }>(
        `/shopify/themes/${encoded}/files?filenames=${encodeURIComponent(filenames)}`,
      );
      setFiles(response.data.files ?? []);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught : new ApiError('UNKNOWN', 'Read failed.', 0),
      );
      setFiles(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Theme files"
      actions={
        <button className="btn btn--sm" onClick={read} disabled={busy || selected === ''}>
          {busy ? 'Reading…' : 'Read files'}
        </button>
      }
    >
      <div className="stack">
        <div className="form-grid">
          <div className="field">
            <label className="field__label">Theme</label>
            <select
              className="select"
              value={selected}
              onChange={(event) => setThemeId(event.target.value)}
            >
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                  {theme.live ? ' (live)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label">Filenames (comma-separated)</label>
            <input
              className="input"
              value={filenames}
              onChange={(event) => setFilenames(event.target.value)}
            />
            <div className="field__hint">
              Try: {SUGGESTED_FILES.join(', ')}
            </div>
          </div>
        </div>

        {error !== null && (
          <Callout tone="danger" title={error.code}>
            {error.message}
          </Callout>
        )}

        {files !== null &&
          (files.length === 0 ? (
            <EmptyState
              title="No files returned"
              description="Shopify returned nothing for those filenames. Check the exact paths."
            />
          ) : (
            files.map((file) => (
              <div key={file.filename} className="stack">
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <span className="mono table__strong">{file.filename}</span>
                  {typeof file.size === 'number' && (
                    <Badge tone="neutral">{file.size} bytes</Badge>
                  )}
                </div>
                <pre className="mono" style={{ overflowX: 'auto', maxHeight: 320 }}>
                  {file.body ?? '(no body returned)'}
                </pre>
              </div>
            ))
          ))}
      </div>
    </Card>
  );
}
