-- Room capacity per set-up type (#208): a room's rows name setup_type option
-- labels. Room.capacity stays as the headline number.
-- CreateTable
CREATE TABLE "RoomCapacity" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "setupType" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "RoomCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomCapacity_roomId_setupType_key" ON "RoomCapacity"("roomId", "setupType");

-- AddForeignKey
ALTER TABLE "RoomCapacity" ADD CONSTRAINT "RoomCapacity_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

