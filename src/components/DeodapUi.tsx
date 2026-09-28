'use client';

/**
 * Pieces shared by the DeoDap pages: section navigation, the CSV file picker, the
 * column-mapping editor, and the note that nothing is sent to DeoDap.
 *
 * The file is read in the browser with File.text() and sent to the backend as text,
 * which does all of the parsing. There is exactly one CSV reader, and it is the one
 * with the tests (Trademart_B suppliers/deodap/deodap.csv.ts).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ChangeEvent } from 'react';

import { Badge, Callout } from '@/components/ui';
import { uploadProblem } from '@/lib/deodap';
import type { DeodapCatalogField, DeodapColumnMapping, DeodapFieldInfo } from '@/lib/types';

const SECTIONS: { href: string; label: string }[] = [
  { href: '/suppliers/deodap', label: 'Overview' },
  { href: '/suppliers/deodap/import', label: 'Import products' },
  { href: '/suppliers/deodap/sync', label: 'Cost sync' },
  { href: '/suppliers/deodap/orders', label: 'Orders' },
];

export function DeodapNav() {
  const pathname = usePathname();
  return (
    <nav className="row" aria-label="DeoDap sections" style={{ gap: 6, marginBottom: 16 }}>
      {SECTIONS.map((section) => {
        const active = pathname === section.href;
        return (
          <Link
            key={section.href}
            href={section.href}
            className={`btn btn--sm${active ? ' btn--primary' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** States plainly that Trademart does not talk to DeoDap, and why. */
export function DeodapApiNote({ api }: { api: { available: boolean; reason: string } }) {
  if (api.available) return null;
  return (
    <Callout tone="info" title="Nothing is sent to DeoDap automatically">
      {api.reason}
    </Callout>
  );
}

export interface LoadedCsv {
  name: string;
  text: string;
}

/** Picks a CSV file and reads it as text. Refuses Excel files and oversized files. */
export function CsvFilePicker({
  id,
  label,
  disabled,
  onLoaded,
}: {
  id: string;
  label: string;
  disabled?: boolean;
  onLoaded: (file: LoadedCsv) => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so choosing the same file again (after fixing it) fires a change.
    event.target.value = '';
    if (file === undefined) return;

    setProblem(null);
    if (/\.(xlsx|xls|xlsm|ods|numbers)$/i.test(file.name)) {
      setProblem(
        'This is a spreadsheet file, not a CSV. Open it and use File → Save As (or Download) → CSV, then choose the CSV here.',
      );
      return;
    }

    setReading(true);
    try {
      const text = await file.text();
      if (text.includes('\u0000')) {
        setProblem('This does not look like a text CSV file. Save it as CSV and try again.');
        return;
      }
      const issue = uploadProblem(text);
      if (issue !== null) {
        setProblem(issue);
        return;
      }
      onLoaded({ name: file.name, text });
    } catch {
      setProblem('The file could not be read. Save it as CSV and try again.');
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept=".csv,text/csv,text/plain"
        onChange={(event) => void onChange(event)}
        disabled={disabled === true || reading}
      />
      <div className="field__hint">
        A CSV file of up to about 1 MB - comma, semicolon or tab separated. Nothing changes
        until you choose what to do on the next step.
      </div>
      {problem !== null && (
        <Callout tone="warning" title="This file cannot be used">
          {problem}
        </Callout>
      )}
    </div>
  );
}

const OPTION_FIELDS: readonly DeodapCatalogField[] = [
  'option1Name',
  'option1Value',
  'option2Name',
  'option2Value',
  'option3Name',
  'option3Value',
];

function MappingRow({
  info,
  headers,
  mapping,
  disabled,
  onChange,
}: {
  info: DeodapFieldInfo;
  headers: string[];
  mapping: DeodapColumnMapping;
  disabled: boolean;
  onChange: (field: DeodapCatalogField, header: string | null) => void;
}) {
  const current = mapping.fields[info.field] ?? '';
  const guessed = mapping.guessed.includes(info.field);
  return (
    <tr>
      <td style={{ width: '24%' }}>
        {info.label}
        {info.required && <span className="muted"> (required)</span>}
      </td>
      <td style={{ width: '32%' }}>
        <select
          className="select"
          aria-label={`Column for ${info.label}`}
          value={current}
          disabled={disabled}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            onChange(info.field, event.target.value === '' ? null : event.target.value)
          }
        >
          <option value="">— not used —</option>
          {headers.map((header) => (
            <option key={header} value={header}>
              {header}
            </option>
          ))}
        </select>
      </td>
      <td className="muted">
        {guessed && (
          <>
            <Badge tone="warning" title="Matched only by a general column name">
              check this
            </Badge>{' '}
          </>
        )}
        {info.required && current === '' && (
          <>
            <Badge tone="danger">not set</Badge>{' '}
          </>
        )}
        {info.hint}
      </td>
    </tr>
  );
}

/**
 * Which column of the file feeds which field. Every change re-runs the preview, so
 * the effect of a choice is visible at once.
 */
export function MappingEditor({
  fields,
  headers,
  mapping,
  disabled,
  onChange,
}: {
  fields: DeodapFieldInfo[];
  headers: string[];
  mapping: DeodapColumnMapping;
  disabled: boolean;
  onChange: (field: DeodapCatalogField, header: string | null) => void;
}) {
  const main = fields.filter((info) => !OPTION_FIELDS.includes(info.field));
  const options = fields.filter((info) => OPTION_FIELDS.includes(info.field));
  const optionsInUse = options.some((info) => mapping.fields[info.field] !== undefined);

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Column in your file</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {main.map((info) => (
              <MappingRow
                key={info.field}
                info={info}
                headers={headers}
                mapping={mapping}
                disabled={disabled}
                onChange={onChange}
              />
            ))}
            <tr>
              <td>Images</td>
              <td colSpan={2} className="muted">
                {mapping.imageColumns.length > 0
                  ? mapping.imageColumns.join(', ')
                  : 'No image column found. Products can be imported without images.'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <details open={optionsInUse}>
        <summary className="muted" style={{ cursor: 'pointer' }}>
          Variant options (size, colour...){optionsInUse ? '' : ' - none detected'}
        </summary>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="table">
            <tbody>
              {options.map((info) => (
                <MappingRow
                  key={info.field}
                  info={info}
                  headers={headers}
                  mapping={mapping}
                  disabled={disabled}
                  onChange={onChange}
                />
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
