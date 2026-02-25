-- CreateTable
CREATE TABLE "Zone" (
    "zone_code" TEXT NOT NULL,
    "zone_name" TEXT NOT NULL,
    "headquarters" TEXT NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("zone_code")
);

-- CreateTable
CREATE TABLE "Station" (
    "station_code" TEXT NOT NULL,
    "station_name" TEXT NOT NULL,
    "state" TEXT,
    "zone_code" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "elevation_m" DOUBLE PRECISION,
    "station_category" TEXT,
    "num_platforms" INTEGER,
    "has_retiring_room" BOOLEAN NOT NULL DEFAULT false,
    "has_waiting_room" BOOLEAN NOT NULL DEFAULT false,
    "has_food_plaza" BOOLEAN NOT NULL DEFAULT false,
    "has_wifi" BOOLEAN NOT NULL DEFAULT false,
    "is_junction" BOOLEAN NOT NULL DEFAULT false,
    "is_terminus" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("station_code")
);

-- CreateTable
CREATE TABLE "Train" (
    "train_number" TEXT NOT NULL,
    "train_name" TEXT NOT NULL,
    "train_type" TEXT NOT NULL,
    "source_station_code" TEXT NOT NULL,
    "destination_station_code" TEXT NOT NULL,
    "total_distance_km" DOUBLE PRECISION,
    "total_duration_mins" INTEGER,
    "run_days" INTEGER NOT NULL DEFAULT 127,
    "zone_code" TEXT,
    "has_pantry" BOOLEAN NOT NULL DEFAULT false,
    "locomotive_type" TEXT,
    "classes_available" TEXT[],

    CONSTRAINT "Train_pkey" PRIMARY KEY ("train_number")
);

-- CreateTable
CREATE TABLE "TrainStop" (
    "id" SERIAL NOT NULL,
    "train_number" TEXT NOT NULL,
    "station_code" TEXT NOT NULL,
    "stop_sequence" INTEGER NOT NULL,
    "arrival_time_mins" INTEGER,
    "departure_time_mins" INTEGER,
    "halt_duration_mins" INTEGER,
    "day_number" INTEGER NOT NULL DEFAULT 1,
    "distance_from_source_km" DOUBLE PRECISION,
    "platform_number" TEXT,
    "is_technical_halt" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TrainStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachConfig" (
    "id" SERIAL NOT NULL,
    "train_number" TEXT NOT NULL,
    "class_code" TEXT NOT NULL,
    "coach_label" TEXT NOT NULL,
    "position_in_train" INTEGER NOT NULL,
    "num_seats" INTEGER,

    CONSTRAINT "CoachConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RakeGroup" (
    "group_id" SERIAL NOT NULL,
    "notes" TEXT,

    CONSTRAINT "RakeGroup_pkey" PRIMARY KEY ("group_id")
);

-- CreateTable
CREATE TABLE "RakeMember" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "train_number" TEXT NOT NULL,
    "sequence_in_group" INTEGER NOT NULL,

    CONSTRAINT "RakeMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackSegment" (
    "id" SERIAL NOT NULL,
    "from_station_code" TEXT NOT NULL,
    "to_station_code" TEXT NOT NULL,
    "distance_km" DOUBLE PRECISION,
    "track_type" TEXT,
    "electrified" BOOLEAN NOT NULL DEFAULT false,
    "gauge" TEXT NOT NULL DEFAULT 'BG',

    CONSTRAINT "TrackSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainStop_train_number_idx" ON "TrainStop"("train_number");

-- CreateIndex
CREATE INDEX "TrainStop_station_code_idx" ON "TrainStop"("station_code");

-- CreateIndex
CREATE INDEX "TrainStop_train_number_station_code_idx" ON "TrainStop"("train_number", "station_code");

-- CreateIndex
CREATE UNIQUE INDEX "TrainStop_train_number_stop_sequence_key" ON "TrainStop"("train_number", "stop_sequence");

-- CreateIndex
CREATE INDEX "CoachConfig_train_number_idx" ON "CoachConfig"("train_number");

-- CreateIndex
CREATE UNIQUE INDEX "RakeMember_group_id_train_number_key" ON "RakeMember"("group_id", "train_number");

-- CreateIndex
CREATE INDEX "TrackSegment_from_station_code_idx" ON "TrackSegment"("from_station_code");

-- CreateIndex
CREATE INDEX "TrackSegment_to_station_code_idx" ON "TrackSegment"("to_station_code");

-- CreateIndex
CREATE UNIQUE INDEX "TrackSegment_from_station_code_to_station_code_key" ON "TrackSegment"("from_station_code", "to_station_code");

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_zone_code_fkey" FOREIGN KEY ("zone_code") REFERENCES "Zone"("zone_code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Train" ADD CONSTRAINT "Train_source_station_code_fkey" FOREIGN KEY ("source_station_code") REFERENCES "Station"("station_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Train" ADD CONSTRAINT "Train_destination_station_code_fkey" FOREIGN KEY ("destination_station_code") REFERENCES "Station"("station_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Train" ADD CONSTRAINT "Train_zone_code_fkey" FOREIGN KEY ("zone_code") REFERENCES "Zone"("zone_code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainStop" ADD CONSTRAINT "TrainStop_train_number_fkey" FOREIGN KEY ("train_number") REFERENCES "Train"("train_number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainStop" ADD CONSTRAINT "TrainStop_station_code_fkey" FOREIGN KEY ("station_code") REFERENCES "Station"("station_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachConfig" ADD CONSTRAINT "CoachConfig_train_number_fkey" FOREIGN KEY ("train_number") REFERENCES "Train"("train_number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RakeMember" ADD CONSTRAINT "RakeMember_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "RakeGroup"("group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RakeMember" ADD CONSTRAINT "RakeMember_train_number_fkey" FOREIGN KEY ("train_number") REFERENCES "Train"("train_number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackSegment" ADD CONSTRAINT "TrackSegment_from_station_code_fkey" FOREIGN KEY ("from_station_code") REFERENCES "Station"("station_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackSegment" ADD CONSTRAINT "TrackSegment_to_station_code_fkey" FOREIGN KEY ("to_station_code") REFERENCES "Station"("station_code") ON DELETE RESTRICT ON UPDATE CASCADE;
