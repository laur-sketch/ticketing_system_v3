-- CreateTable
CREATE TABLE "org_chart_nodes" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "merged_source_user_id" TEXT NOT NULL,
    "person_name" TEXT NOT NULL,
    "person_role" TEXT,
    "company_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "org_chart_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_chart_nodes_merged_source_user_id_key" ON "org_chart_nodes"("merged_source_user_id");

-- CreateIndex
CREATE INDEX "org_chart_nodes_parent_id_sort_order_idx" ON "org_chart_nodes"("parent_id", "sort_order");

-- AddForeignKey
ALTER TABLE "org_chart_nodes" ADD CONSTRAINT "org_chart_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "org_chart_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
