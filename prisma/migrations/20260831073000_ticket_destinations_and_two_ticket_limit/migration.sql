ALTER TABLE "Cluster" ADD COLUMN "defaultOptionId" TEXT;

-- Existing installations may have disabled the global cap or kept the old
-- default of three. The public ticket workflow has one fixed safety ceiling.
UPDATE "GuildConfig" SET "globalMaxOpenPerUser" = 2;

-- Keep existing clusters working immediately when the standard option supports
-- that cluster. Do not write a default the public resolver will reject.
UPDATE "Cluster"
SET "defaultOptionId" = (
  SELECT "id" FROM "Option"
  WHERE "isActive" = true
    AND "name" = 'Hỗ Trợ Chung'
    AND (
      "clusterKeys" = '*'
      OR instr(',' || replace("clusterKeys", ' ', '') || ',', ',' || "Cluster"."key" || ',') > 0
    )
  ORDER BY "sortOrder" ASC, "createdAt" ASC
  LIMIT 1
)
WHERE "defaultOptionId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "Option"
    WHERE "isActive" = true
      AND "name" = 'Hỗ Trợ Chung'
      AND (
        "clusterKeys" = '*'
        OR instr(',' || replace("clusterKeys", ' ', '') || ',', ',' || "Cluster"."key" || ',') > 0
      )
  );
