import type { StructuredBrief } from "@/lib/brief";

/* Editorial spec-sheet renderer for a structured project brief. Single-column
 * by design — handles missing sections gracefully, reads identically at
 * 375px and 1440px. Uses only existing tokens from globals.css. */

export function BriefSheet({ brief }: { brief: StructuredBrief }) {
  const loc = brief.location;
  const prop = brief.property;
  const hasProperty =
    !!prop &&
    (prop.ownership ||
      prop.dimensions ||
      prop.wetAreas ||
      prop.substrate ||
      prop.era);
  const hasLocation =
    !!loc && (loc.building || loc.address || loc.yearBuilt);

  return (
    <article className="text-ink">
      {hasLocation && <LocationStrip loc={loc!} />}

      <Section label="Scope" first={!hasLocation}>
        <p className="text-[15px] leading-relaxed text-ink">
          {brief.scope}
        </p>
      </Section>

      {hasProperty && (
        <Section label="Property">
          <PropertyGrid prop={prop!} />
        </Section>
      )}

      {brief.existingConditions?.length ? (
        <Section label="Existing conditions">
          <ItemList items={brief.existingConditions} />
        </Section>
      ) : null}

      {brief.preWorkCompleted?.length ? (
        <Section label="Cleared" tone="positive">
          <ItemList items={brief.preWorkCompleted} variant="done" />
        </Section>
      ) : null}

      {brief.hazards?.length ? (
        <Section
          label="Hazards"
          tone="warn"
          aside="Read on every task"
        >
          <ItemList items={brief.hazards} variant="hazard" />
        </Section>
      ) : null}

      {brief.constraints?.length ? (
        <Section label="Constraints">
          <ItemList items={brief.constraints} />
        </Section>
      ) : null}

      {brief.notes ? (
        <Section label="Notes">
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink-soft">
            {brief.notes}
          </p>
        </Section>
      ) : null}
    </article>
  );
}

/* ----------------------------- subcomponents ---------------------------- */

function LocationStrip({
  loc,
}: {
  loc: NonNullable<StructuredBrief["location"]>;
}) {
  const parts = [
    loc.building,
    loc.address,
    loc.yearBuilt ? `Built ${loc.yearBuilt}` : null,
  ].filter((p): p is string => Boolean(p));
  if (parts.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center text-sm text-ink-soft">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center">
          {i > 0 && (
            <span
              className="mx-2.5 inline-block size-[3px] rounded-full bg-ink-faint"
              aria-hidden
            />
          )}
          <span>{part}</span>
        </span>
      ))}
    </div>
  );
}

function Section({
  label,
  tone,
  aside,
  first,
  children,
}: {
  label: string;
  tone?: "positive" | "warn";
  aside?: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "warn"
        ? "text-warn"
        : "text-ink-faint";
  return (
    <section className={first ? "mt-7" : "mt-7 pt-7 border-t border-line"}>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <span
          className={`text-[10px] font-semibold tracking-[0.2em] uppercase ${toneClass}`}
        >
          {label}
        </span>
        {aside && (
          <span className="sheet-no shrink-0 text-ink-faint opacity-70">
            {aside}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function PropertyGrid({
  prop,
}: {
  prop: NonNullable<StructuredBrief["property"]>;
}) {
  const rows: Array<[string, string]> = [];
  if (prop.ownership) rows.push(["Ownership", prop.ownership]);
  if (prop.dimensions) rows.push(["Dimensions", prop.dimensions]);
  if (prop.wetAreas) rows.push(["Wet areas", prop.wetAreas]);
  if (prop.substrate) rows.push(["Substrate", prop.substrate]);
  if (prop.era) rows.push(["Era pieces", prop.era]);
  return (
    <dl
      className="grid gap-x-7 gap-y-2.5 text-sm tabular-nums"
      style={{ gridTemplateColumns: "minmax(110px, 130px) 1fr" }}
    >
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="pt-0.5 text-[11px] font-semibold tracking-[0.14em] text-ink-faint uppercase">
            {label}
          </dt>
          <dd className="m-0 text-ink-soft">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ItemList({
  items,
  variant,
}: {
  items: string[];
  variant?: "done" | "hazard";
}) {
  return (
    <ul className="m-0 list-none p-0">
      {items.map((item, i) => (
        <li
          key={i}
          className={`relative border-t border-line py-2 pl-[18px] text-sm first:border-t-0 first:pt-0.5 ${
            variant === "done" ? "text-ink" : "text-ink-soft"
          }`}
        >
          <Marker variant={variant} firstChild={i === 0} />
          {item}
        </li>
      ))}
    </ul>
  );
}

function Marker({
  variant,
  firstChild,
}: {
  variant?: "done" | "hazard";
  firstChild: boolean;
}) {
  if (variant === "done") {
    return (
      <span
        aria-hidden
        className="absolute left-0 size-[7px] rounded-full bg-positive"
        style={{ top: firstChild ? 8 : 14 }}
      />
    );
  }
  if (variant === "hazard") {
    return (
      <span
        aria-hidden
        className="absolute left-0 h-px w-[8px] bg-warn"
        style={{ top: firstChild ? 11 : 17 }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="absolute left-0 h-px w-[6px] bg-ink-faint"
      style={{ top: firstChild ? 11 : 17 }}
    />
  );
}
