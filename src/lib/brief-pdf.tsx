import "server-only";
import path from "node:path";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { StructuredBrief } from "@/lib/brief";

/* PDF render of the project brief — mirrors the editorial spec sheet in
 * src/components/brief-sheet.tsx. Single-column, Geist throughout, the
 * same ink/paper/positive/warn palette. Designed to print cleanly on
 * Letter at 0.75" margins with a few accent colors. */

const fontDir = path.join(process.cwd(), "src/lib/fonts");
let fontsRegistered = false;
function registerFontsOnce() {
  if (fontsRegistered) return;
  Font.register({
    family: "Geist",
    fonts: [
      { src: path.join(fontDir, "Geist-Regular.ttf"), fontWeight: 400 },
      { src: path.join(fontDir, "Geist-Medium.ttf"), fontWeight: 500 },
      { src: path.join(fontDir, "Geist-SemiBold.ttf"), fontWeight: 600 },
      { src: path.join(fontDir, "Geist-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Word breaks inside long URLs / addresses look fine — no hyphenation.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const C = {
  paper: "#f6f4ef",
  ink: "#16140f",
  inkSoft: "#595449",
  inkFaint: "#918b7e",
  line: "#e5e1d6",
  lineStrong: "#cdc7b8",
  brass: "#1f2a3d",
  positive: "#3c6b54",
  warn: "#8a6326",
} as const;

const styles = StyleSheet.create({
  page: {
    backgroundColor: C.paper,
    color: C.ink,
    fontFamily: "Geist",
    fontSize: 11,
    paddingTop: 56,
    paddingBottom: 56,
    paddingHorizontal: 64,
    lineHeight: 1.55,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  eyebrow: {
    fontSize: 8,
    fontWeight: 600,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: C.brass,
  },
  pageNum: {
    fontSize: 8,
    color: C.inkFaint,
    letterSpacing: 0.8,
  },
  titleRule: {
    height: 1,
    backgroundColor: C.lineStrong,
    marginTop: 4,
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    color: C.ink,
    lineHeight: 1.1,
    marginBottom: 6,
  },
  locationStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    fontSize: 10,
    color: C.inkSoft,
    marginTop: 4,
  },
  locationDot: {
    color: C.inkFaint,
    marginHorizontal: 6,
  },
  section: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 0.5,
    borderTopColor: C.line,
  },
  sectionFirst: {
    marginTop: 18,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 8,
    fontWeight: 600,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: C.inkFaint,
  },
  sectionLabelPositive: { color: C.positive },
  sectionLabelWarn: { color: C.warn },
  aside: {
    fontSize: 8,
    color: C.inkFaint,
    letterSpacing: 0.6,
  },
  paragraph: {
    fontSize: 11,
    color: C.ink,
    lineHeight: 1.55,
  },
  paragraphSoft: {
    fontSize: 10.5,
    color: C.inkSoft,
    lineHeight: 1.55,
  },
  propertyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 3,
  },
  propertyLabel: {
    width: 100,
    fontSize: 8,
    fontWeight: 600,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: C.inkFaint,
    paddingTop: 2,
  },
  propertyValue: {
    flex: 1,
    fontSize: 10.5,
    color: C.inkSoft,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 5,
    borderTopWidth: 0.5,
    borderTopColor: C.line,
  },
  listItemFirst: {
    borderTopWidth: 0,
    paddingTop: 1,
  },
  marker: {
    width: 10,
    paddingTop: 5,
  },
  markerLine: {
    height: 1,
    width: 6,
    backgroundColor: C.inkFaint,
  },
  markerLineWarn: { backgroundColor: C.warn, width: 8 },
  markerDotPositive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.positive,
  },
  listText: {
    flex: 1,
    fontSize: 10.5,
    color: C.inkSoft,
    lineHeight: 1.5,
  },
  listTextDone: { color: C.ink },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
    marginHorizontal: -6,
  },
  photoCell: {
    width: "50%",
    padding: 6,
  },
  photoImage: {
    width: "100%",
    height: 180,
    objectFit: "cover",
    borderWidth: 0.5,
    borderColor: C.lineStrong,
  },
  photoCaption: {
    marginTop: 4,
    fontSize: 8.5,
    color: C.inkFaint,
    letterSpacing: 0.3,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 64,
    right: 64,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: C.inkFaint,
    letterSpacing: 0.4,
  },
});

export type BriefPhoto = {
  id: string;
  url: string;
  caption: string | null;
};

export function BriefPDF({
  title,
  brief,
  photos,
  generatedAt,
}: {
  title: string;
  brief: StructuredBrief;
  photos: BriefPhoto[];
  generatedAt: Date;
}) {
  registerFontsOnce();

  const loc = brief.location;
  const prop = brief.property;
  const hasProperty =
    !!prop &&
    !!(
      prop.ownership ||
      prop.dimensions ||
      prop.wetAreas ||
      prop.substrate ||
      prop.era
    );
  const hasLocation =
    !!loc && !!(loc.building || loc.address || loc.yearBuilt);

  const dateStr = generatedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Document
      title={`${title} — Project Brief`}
      author="DIY Reno"
      subject="Project brief"
    >
      <Page size="LETTER" style={styles.page} wrap>
        {/* Masthead */}
        <View style={styles.headerRow} fixed>
          <Text style={styles.eyebrow}>Project Brief</Text>
          <Text
            style={styles.pageNum}
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
        <View style={styles.titleRule} fixed />

        <Text style={styles.title}>{title || brief.title}</Text>

        {hasLocation && (
          <LocationStrip loc={loc!} />
        )}

        {/* Scope */}
        <Section label="Scope" first={!hasLocation}>
          <Text style={styles.paragraph}>{brief.scope}</Text>
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
            <Text style={styles.paragraphSoft}>{brief.notes}</Text>
          </Section>
        ) : null}

        {photos.length > 0 && (
          <Section label="Photos">
            <View style={styles.photoGrid}>
              {photos.map((p) => (
                <View key={p.id} style={styles.photoCell} wrap={false}>
                  <Image src={p.url} style={styles.photoImage} />
                  {p.caption && (
                    <Text style={styles.photoCaption}>{p.caption}</Text>
                  )}
                </View>
              ))}
            </View>
          </Section>
        )}

        <View style={styles.footer} fixed>
          <Text>DIY Reno · {title || brief.title}</Text>
          <Text>Generated {dateStr}</Text>
        </View>
      </Page>
    </Document>
  );
}

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
    <View style={styles.locationStrip}>
      {parts.map((part, i) => (
        <Text key={i}>
          {i > 0 ? <Text style={styles.locationDot}>·</Text> : null}
          {part}
        </Text>
      ))}
    </View>
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
  const labelStyle =
    tone === "positive"
      ? [styles.sectionLabel, styles.sectionLabelPositive]
      : tone === "warn"
        ? [styles.sectionLabel, styles.sectionLabelWarn]
        : styles.sectionLabel;
  return (
    <View style={first ? styles.sectionFirst : styles.section} wrap>
      <View style={styles.sectionHeader}>
        <Text style={labelStyle}>{label}</Text>
        {aside && <Text style={styles.aside}>{aside}</Text>}
      </View>
      {children}
    </View>
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
    <View>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.propertyRow} wrap={false}>
          <Text style={styles.propertyLabel}>{label}</Text>
          <Text style={styles.propertyValue}>{value}</Text>
        </View>
      ))}
    </View>
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
    <View>
      {items.map((item, i) => (
        <View
          key={i}
          style={
            i === 0 ? [styles.listItem, styles.listItemFirst] : styles.listItem
          }
          wrap={false}
        >
          <View style={styles.marker}>
            {variant === "done" ? (
              <View style={styles.markerDotPositive} />
            ) : variant === "hazard" ? (
              <View style={[styles.markerLine, styles.markerLineWarn]} />
            ) : (
              <View style={styles.markerLine} />
            )}
          </View>
          <Text
            style={
              variant === "done"
                ? [styles.listText, styles.listTextDone]
                : styles.listText
            }
          >
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}
