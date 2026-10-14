-- AlterTable
ALTER TABLE "EventPostEvent" ADD COLUMN     "nextOpenDate" DATE;

-- "Next open date" was free text in the narrative JSON. Move values that are
-- already ISO dates into the column; anything else stays in the narrative.
UPDATE "EventPostEvent"
SET "nextOpenDate" = ("narrative"->>'nextOpenDate')::date,
    "narrative" = "narrative" - 'nextOpenDate'
WHERE "narrative"->>'nextOpenDate' ~ '^\d{4}-\d{2}-\d{2}$';

-- Keep any remaining free-text value visible: append it to the future dates
-- comments (rich text) and drop the old key.
UPDATE "EventPostEvent"
SET "narrative" = jsonb_set(
      "narrative" - 'nextOpenDate',
      '{futureDatesComments}',
      to_jsonb(
        COALESCE("narrative"->>'futureDatesComments', '')
        || '<p>Next open date: '
        || replace(replace(replace("narrative"->>'nextOpenDate', '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
        || '</p>'
      )
    )
WHERE COALESCE(btrim("narrative"->>'nextOpenDate'), '') <> '';
