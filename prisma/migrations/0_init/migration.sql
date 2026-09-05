-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EntityStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StatusModelType" AS ENUM ('FUNCTION', 'PRESENTATION', 'AV_ORDER', 'CATERING_ORDER', 'SETUP_ORDER', 'PRINT_ORDER', 'MEDIA_DELIVERABLE', 'SUPPLY_ORDER');

-- CreateEnum
CREATE TYPE "AcquisitionState" AS ENUM ('ON_HAND', 'TO_PROCURE', 'DROP_SHIP');

-- CreateEnum
CREATE TYPE "PackingStatus" AS ENUM ('NEEDED', 'IN_TRANSIT', 'DELIVERED');

-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('PLACE', 'CONTAINER');

-- CreateEnum
CREATE TYPE "PermissionResource" AS ENUM ('ROLES', 'USERS', 'SETTINGS', 'SYSTEM', 'EQUIPMENT', 'STORAGE_LOCATIONS', 'WORKFLOWS', 'VENDORS', 'VENUES', 'CONTACTS', 'EVENTS', 'FUNCTIONS', 'PRESENTATIONS', 'AV_ORDERS', 'CATERING_ORDERS', 'SETUP_ORDERS', 'PRINT_ORDERS', 'SUPPLY_ORDERS', 'MEDIA_DELIVERABLES', 'FILES', 'SHARE_LINKS', 'API_KEYS');

-- CreateEnum
CREATE TYPE "PermissionLevel" AS ENUM ('NONE', 'VIEW', 'WRITE', 'DELETE');

-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('GLOBAL', 'ASSIGNED', 'UNASSIGNED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT,
    "roleId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT,
    "clientName" TEXT,
    "redirectUris" TEXT[],
    "grantTypes" TEXT[] DEFAULT ARRAY['authorization_code', 'refresh_token']::TEXT[],
    "responseTypes" TEXT[] DEFAULT ARRAY['code']::TEXT[],
    "tokenEndpointAuthMethod" TEXT NOT NULL DEFAULT 'none',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAuthorizationCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "codeChallengeMethod" TEXT NOT NULL DEFAULT 'S256',
    "scope" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAuthorizationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthRefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomOption" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "group" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "models" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "LocationKind" NOT NULL DEFAULT 'PLACE',
    "type" TEXT,
    "parentId" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "equipmentId" TEXT NOT NULL,
    "quantity" INTEGER,
    "notes" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSeries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "seriesId" TEXT,
    "venueId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "venueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "notes" TEXT,
    "venueId" TEXT NOT NULL,
    "groupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "organization" TEXT,
    "notes" TEXT,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueContact" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT,

    CONSTRAINT "VenueContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventKeyStaff" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "title" TEXT,
    "models" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventKeyStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Function" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT '',
    "notes" TEXT,
    "offSiteLocation" TEXT,
    "status" "EntityStatus",
    "substatus" TEXT,
    "eventId" TEXT NOT NULL,
    "breakoutGroupId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Function_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunctionSchedule" (
    "id" TEXT NOT NULL,
    "functionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunctionSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunctionRoom" (
    "id" TEXT NOT NULL,
    "functionId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,

    CONSTRAINT "FunctionRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunctionContact" (
    "id" TEXT NOT NULL,
    "functionId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT,

    CONSTRAINT "FunctionContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AVOrder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EntityStatus",
    "substatus" TEXT,
    "eventId" TEXT NOT NULL,
    "copiedFromId" TEXT,
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AVOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AVOrderFunction" (
    "id" TEXT NOT NULL,
    "avOrderId" TEXT NOT NULL,
    "functionId" TEXT NOT NULL,

    CONSTRAINT "AVOrderFunction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AVOrderPresentation" (
    "id" TEXT NOT NULL,
    "avOrderId" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,

    CONSTRAINT "AVOrderPresentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BEO" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EntityStatus",
    "substatus" TEXT,
    "eventId" TEXT NOT NULL,
    "functionId" TEXT,
    "serviceStyle" TEXT,
    "expectedCount" INTEGER,
    "confirmedCount" INTEGER,
    "guaranteeCount" INTEGER,
    "staffingNotes" TEXT,
    "rentalMinimum" DECIMAL(65,30),
    "fbMinimum" DECIMAL(65,30),
    "depositDeadline" TIMESTAMP(3),
    "guaranteeDeadline" TIMESTAMP(3),
    "paymentDeadline" TIMESTAMP(3),
    "cancellationTerms" TEXT,
    "dietaryNotes" TEXT,
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BEO_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineItem" (
    "id" TEXT NOT NULL,
    "cateringOrderId" TEXT,
    "functionId" TEXT,
    "label" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimelineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentItem" (
    "id" TEXT NOT NULL,
    "cateringOrderId" TEXT,
    "setupOrderId" TEXT,
    "videoSectionId" TEXT,
    "avOrderId" TEXT,
    "equipmentId" TEXT,
    "item" TEXT NOT NULL,
    "quantity" INTEGER,
    "providerVendorId" TEXT,
    "providerContactId" TEXT,
    "operatorVendorId" TEXT,
    "operatorContactId" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetupOrder" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "setupType" TEXT,
    "status" "EntityStatus",
    "substatus" TEXT,
    "eventId" TEXT NOT NULL,
    "roomId" TEXT,
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SetupOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetupOrderFunction" (
    "id" TEXT NOT NULL,
    "setupOrderId" TEXT NOT NULL,
    "functionId" TEXT NOT NULL,

    CONSTRAINT "SetupOrderFunction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetupOrderPresentation" (
    "id" TEXT NOT NULL,
    "setupOrderId" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,

    CONSTRAINT "SetupOrderPresentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetupTable" (
    "id" TEXT NOT NULL,
    "setupOrderId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "tableType" TEXT,
    "chairCount" INTEGER,
    "chairType" TEXT,
    "providerVendorId" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SetupTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetupOrderDetail" (
    "id" TEXT NOT NULL,
    "setupOrderId" TEXT NOT NULL,
    "headline" TEXT,
    "description" TEXT NOT NULL,
    "responsiblePartyVendorId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SetupOrderDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BEOLineItem" (
    "id" TEXT NOT NULL,
    "beoId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unitType" TEXT,
    "unitPrice" DECIMAL(65,30),
    "quantity" INTEGER,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BEOLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BEOMenuSection" (
    "id" TEXT NOT NULL,
    "beoId" TEXT NOT NULL,
    "responsiblePartyVendorId" TEXT,
    "menuContent" TEXT NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BEOMenuSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CateringOrderServiceLocation" (
    "id" TEXT NOT NULL,
    "cateringOrderId" TEXT NOT NULL,
    "name" TEXT,
    "functionId" TEXT,
    "expectedCount" INTEGER,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CateringOrderServiceLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BEOContact" (
    "id" TEXT NOT NULL,
    "beoId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT,

    CONSTRAINT "BEOContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresentationTrack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresentationTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakoutGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BreakoutGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakoutGroupRoom" (
    "id" TEXT NOT NULL,
    "breakoutGroupId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,

    CONSTRAINT "BreakoutGroupRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakoutSessionRoomOverride" (
    "id" TEXT NOT NULL,
    "functionId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "BreakoutSessionRoomOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresentationSlot" (
    "id" TEXT NOT NULL,
    "functionId" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,
    "roomId" TEXT,
    "advancerVendorId" TEXT,
    "advancerContactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PresentationSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Presentation" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT '',
    "status" "EntityStatus",
    "substatus" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "internalNotes" TEXT,
    "instanceCount" INTEGER NOT NULL DEFAULT 1,
    "trackId" TEXT,
    "breakoutGroupId" TEXT,
    "eventId" TEXT NOT NULL,
    "advancerVendorId" TEXT,
    "advancerContactId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Presentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresentationContact" (
    "id" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PresentationContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "defaultForEntityTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pendingStatusValue" "EntityStatus",
    "pendingSubstatusValue" TEXT,
    "completionStatusValue" "EntityStatus",
    "completionSubstatusValue" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStep" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "computedKey" TEXT,
    "pendingStatusValue" "EntityStatus",
    "pendingSubstatusValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowChecklistItem" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "computedKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowInstance" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStepCompletion" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "WorkflowStepCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowChecklistCompletion" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "WorkflowChecklistCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "models" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "isSystemVendor" BOOLEAN NOT NULL DEFAULT false,
    "venueId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorContact" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "contactType" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "VendorContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventVendor" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "defaultFor" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "EventVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AVOrderVendor" (
    "id" TEXT NOT NULL,
    "avOrderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "AVOrderVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BEOVendor" (
    "id" TEXT NOT NULL,
    "beoId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "BEOVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetupOrderVendor" (
    "id" TEXT NOT NULL,
    "setupOrderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "SetupOrderVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioSection" (
    "id" TEXT NOT NULL,
    "avOrderId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InputGroup" (
    "id" TEXT NOT NULL,
    "audioSectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "providerVendorId" TEXT,
    "providerContactId" TEXT,
    "operatorVendorId" TEXT,
    "operatorContactId" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InputGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InputItem" (
    "id" TEXT NOT NULL,
    "inputGroupId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "equipmentId" TEXT,
    "providerVendorId" TEXT,
    "providerContactId" TEXT,
    "operatorVendorId" TEXT,
    "operatorContactId" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InputItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorMix" (
    "id" TEXT NOT NULL,
    "audioSectionId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "equipmentId" TEXT,
    "providerVendorId" TEXT,
    "providerContactId" TEXT,
    "operatorVendorId" TEXT,
    "operatorContactId" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitorMix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorOutput" (
    "id" TEXT NOT NULL,
    "monitorMixId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "providerVendorId" TEXT,
    "providerContactId" TEXT,
    "operatorVendorId" TEXT,
    "operatorContactId" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitorOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoSection" (
    "id" TEXT NOT NULL,
    "avOrderId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaDeliverable" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EntityStatus",
    "substatus" TEXT,
    "eventId" TEXT NOT NULL,
    "copiedFromId" TEXT,
    "mediaType" TEXT,
    "description" TEXT,
    "delivery" TEXT,
    "notes" TEXT,
    "providerVendorId" TEXT,
    "providerContactId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaDeliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaDeliverableFunction" (
    "id" TEXT NOT NULL,
    "mediaDeliverableId" TEXT NOT NULL,
    "functionId" TEXT NOT NULL,

    CONSTRAINT "MediaDeliverableFunction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaDeliverablePresentation" (
    "id" TEXT NOT NULL,
    "mediaDeliverableId" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,

    CONSTRAINT "MediaDeliverablePresentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaDeliverableContact" (
    "id" TEXT NOT NULL,
    "mediaDeliverableId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT,

    CONSTRAINT "MediaDeliverableContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintOrder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EntityStatus",
    "substatus" TEXT,
    "packingStatus" "PackingStatus",
    "eventId" TEXT NOT NULL,
    "roomId" TEXT,
    "specificLocation" TEXT,
    "presentationId" TEXT,
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintOrderFunction" (
    "id" TEXT NOT NULL,
    "printOrderId" TEXT NOT NULL,
    "functionId" TEXT NOT NULL,

    CONSTRAINT "PrintOrderFunction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintItem" (
    "id" TEXT NOT NULL,
    "printOrderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER,
    "acquisitionState" "AcquisitionState" NOT NULL DEFAULT 'TO_PROCURE',
    "packingStatus" "PackingStatus" NOT NULL DEFAULT 'NEEDED',
    "distributionMethod" TEXT,
    "distributionNotes" TEXT,
    "designerVendorId" TEXT,
    "designerContactId" TEXT,
    "printerVendorId" TEXT,
    "printerContactId" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sourceLocationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintOrderVendor" (
    "id" TEXT NOT NULL,
    "printOrderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "PrintOrderVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyOrder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EntityStatus",
    "substatus" TEXT,
    "eventId" TEXT NOT NULL,
    "roomId" TEXT,
    "specificLocation" TEXT,
    "notes" TEXT,
    "providerVendorId" TEXT,
    "providerContactId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyOrderItem" (
    "id" TEXT NOT NULL,
    "supplyOrderId" TEXT NOT NULL,
    "description" TEXT,
    "equipmentId" TEXT,
    "quantity" INTEGER,
    "acquisitionState" "AcquisitionState" NOT NULL DEFAULT 'ON_HAND',
    "providerVendorId" TEXT,
    "providerContactId" TEXT,
    "packingStatus" "PackingStatus" NOT NULL DEFAULT 'NEEDED',
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sourceLocationId" TEXT,
    "containerLocationId" TEXT,
    "inventoryItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyOrderFunction" (
    "id" TEXT NOT NULL,
    "supplyOrderId" TEXT NOT NULL,
    "functionId" TEXT NOT NULL,

    CONSTRAINT "SupplyOrderFunction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyOrderPresentation" (
    "id" TEXT NOT NULL,
    "supplyOrderId" TEXT NOT NULL,
    "presentationId" TEXT NOT NULL,

    CONSTRAINT "SupplyOrderPresentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileUpload" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileType" TEXT,
    "eventId" TEXT,
    "cateringOrderId" TEXT,
    "avOrderId" TEXT,
    "setupOrderId" TEXT,
    "printOrderId" TEXT,
    "supplyOrderId" TEXT,
    "mediaDeliverableId" TEXT,
    "venueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "filtersLocked" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastAccessedAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLinkGroup" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "label" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastAccessedAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ShareLinkGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLinkGroupItem" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "filtersLocked" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLinkGroupItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventStatusDefault" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "modelType" "StatusModelType" NOT NULL,
    "status" "EntityStatus" NOT NULL,
    "substatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventStatusDefault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "resource" "PermissionResource" NOT NULL,
    "scope" "PermissionScope" NOT NULL,
    "level" "PermissionLevel" NOT NULL DEFAULT 'NONE',

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventStaff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessLevel" "PermissionLevel",

    CONSTRAINT "EventStaff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_hashedKey_key" ON "ApiKey"("hashedKey");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthClient_clientId_key" ON "OAuthClient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAuthorizationCode_code_key" ON "OAuthAuthorizationCode"("code");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationCode_code_idx" ON "OAuthAuthorizationCode"("code");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationCode_userId_idx" ON "OAuthAuthorizationCode"("userId");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationCode_expiresAt_idx" ON "OAuthAuthorizationCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthRefreshToken_tokenHash_key" ON "OAuthRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "OAuthRefreshToken_familyId_idx" ON "OAuthRefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "OAuthRefreshToken_userId_idx" ON "OAuthRefreshToken"("userId");

-- CreateIndex
CREATE INDEX "OAuthRefreshToken_expiresAt_idx" ON "OAuthRefreshToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "UserSetting_userId_idx" ON "UserSetting"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSetting_userId_key_key" ON "UserSetting"("userId", "key");

-- CreateIndex
CREATE INDEX "CustomOption_category_idx" ON "CustomOption"("category");

-- CreateIndex
CREATE UNIQUE INDEX "CustomOption_category_label_key" ON "CustomOption"("category", "label");

-- CreateIndex
CREATE INDEX "Equipment_category_idx" ON "Equipment"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_category_name_key" ON "Equipment"("category", "name");

-- CreateIndex
CREATE INDEX "StorageLocation_parentId_idx" ON "StorageLocation"("parentId");

-- CreateIndex
CREATE INDEX "StorageLocation_kind_idx" ON "StorageLocation"("kind");

-- CreateIndex
CREATE INDEX "InventoryItem_locationId_idx" ON "InventoryItem"("locationId");

-- CreateIndex
CREATE INDEX "InventoryItem_equipmentId_idx" ON "InventoryItem"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "EventSeries_name_key" ON "EventSeries"("name");

-- CreateIndex
CREATE INDEX "Event_updatedById_idx" ON "Event"("updatedById");

-- CreateIndex
CREATE INDEX "Event_seriesId_idx" ON "Event"("seriesId");

-- CreateIndex
CREATE INDEX "Venue_updatedById_idx" ON "Venue"("updatedById");

-- CreateIndex
CREATE INDEX "RoomGroup_venueId_idx" ON "RoomGroup"("venueId");

-- CreateIndex
CREATE INDEX "Room_groupId_idx" ON "Room"("groupId");

-- CreateIndex
CREATE INDEX "Contact_updatedById_idx" ON "Contact"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "VenueContact_venueId_contactId_key" ON "VenueContact"("venueId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "EventKeyStaff_eventId_contactId_title_key" ON "EventKeyStaff"("eventId", "contactId", "title");

-- CreateIndex
CREATE INDEX "Function_eventId_idx" ON "Function"("eventId");

-- CreateIndex
CREATE INDEX "Function_breakoutGroupId_idx" ON "Function"("breakoutGroupId");

-- CreateIndex
CREATE INDEX "Function_updatedById_idx" ON "Function"("updatedById");

-- CreateIndex
CREATE INDEX "FunctionSchedule_functionId_idx" ON "FunctionSchedule"("functionId");

-- CreateIndex
CREATE UNIQUE INDEX "FunctionRoom_functionId_roomId_key" ON "FunctionRoom"("functionId", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "FunctionContact_functionId_contactId_key" ON "FunctionContact"("functionId", "contactId");

-- CreateIndex
CREATE INDEX "AVOrder_eventId_idx" ON "AVOrder"("eventId");

-- CreateIndex
CREATE INDEX "AVOrder_copiedFromId_idx" ON "AVOrder"("copiedFromId");

-- CreateIndex
CREATE INDEX "AVOrder_updatedById_idx" ON "AVOrder"("updatedById");

-- CreateIndex
CREATE INDEX "AVOrderFunction_functionId_idx" ON "AVOrderFunction"("functionId");

-- CreateIndex
CREATE UNIQUE INDEX "AVOrderFunction_avOrderId_functionId_key" ON "AVOrderFunction"("avOrderId", "functionId");

-- CreateIndex
CREATE INDEX "AVOrderPresentation_presentationId_idx" ON "AVOrderPresentation"("presentationId");

-- CreateIndex
CREATE UNIQUE INDEX "AVOrderPresentation_avOrderId_presentationId_key" ON "AVOrderPresentation"("avOrderId", "presentationId");

-- CreateIndex
CREATE UNIQUE INDEX "BEO_functionId_key" ON "BEO"("functionId");

-- CreateIndex
CREATE INDEX "BEO_eventId_idx" ON "BEO"("eventId");

-- CreateIndex
CREATE INDEX "BEO_updatedById_idx" ON "BEO"("updatedById");

-- CreateIndex
CREATE INDEX "TimelineItem_cateringOrderId_idx" ON "TimelineItem"("cateringOrderId");

-- CreateIndex
CREATE INDEX "TimelineItem_functionId_idx" ON "TimelineItem"("functionId");

-- CreateIndex
CREATE INDEX "EquipmentItem_cateringOrderId_idx" ON "EquipmentItem"("cateringOrderId");

-- CreateIndex
CREATE INDEX "EquipmentItem_setupOrderId_idx" ON "EquipmentItem"("setupOrderId");

-- CreateIndex
CREATE INDEX "EquipmentItem_videoSectionId_idx" ON "EquipmentItem"("videoSectionId");

-- CreateIndex
CREATE INDEX "EquipmentItem_avOrderId_idx" ON "EquipmentItem"("avOrderId");

-- CreateIndex
CREATE INDEX "EquipmentItem_equipmentId_idx" ON "EquipmentItem"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentItem_providerVendorId_idx" ON "EquipmentItem"("providerVendorId");

-- CreateIndex
CREATE INDEX "EquipmentItem_providerContactId_idx" ON "EquipmentItem"("providerContactId");

-- CreateIndex
CREATE INDEX "EquipmentItem_operatorVendorId_idx" ON "EquipmentItem"("operatorVendorId");

-- CreateIndex
CREATE INDEX "EquipmentItem_operatorContactId_idx" ON "EquipmentItem"("operatorContactId");

-- CreateIndex
CREATE INDEX "SetupOrder_eventId_idx" ON "SetupOrder"("eventId");

-- CreateIndex
CREATE INDEX "SetupOrder_roomId_idx" ON "SetupOrder"("roomId");

-- CreateIndex
CREATE INDEX "SetupOrder_updatedById_idx" ON "SetupOrder"("updatedById");

-- CreateIndex
CREATE INDEX "SetupOrderFunction_functionId_idx" ON "SetupOrderFunction"("functionId");

-- CreateIndex
CREATE UNIQUE INDEX "SetupOrderFunction_setupOrderId_functionId_key" ON "SetupOrderFunction"("setupOrderId", "functionId");

-- CreateIndex
CREATE INDEX "SetupOrderPresentation_presentationId_idx" ON "SetupOrderPresentation"("presentationId");

-- CreateIndex
CREATE UNIQUE INDEX "SetupOrderPresentation_setupOrderId_presentationId_key" ON "SetupOrderPresentation"("setupOrderId", "presentationId");

-- CreateIndex
CREATE INDEX "SetupTable_setupOrderId_idx" ON "SetupTable"("setupOrderId");

-- CreateIndex
CREATE INDEX "SetupTable_providerVendorId_idx" ON "SetupTable"("providerVendorId");

-- CreateIndex
CREATE INDEX "SetupOrderDetail_setupOrderId_idx" ON "SetupOrderDetail"("setupOrderId");

-- CreateIndex
CREATE INDEX "SetupOrderDetail_responsiblePartyVendorId_idx" ON "SetupOrderDetail"("responsiblePartyVendorId");

-- CreateIndex
CREATE INDEX "BEOLineItem_beoId_idx" ON "BEOLineItem"("beoId");

-- CreateIndex
CREATE INDEX "BEOMenuSection_beoId_idx" ON "BEOMenuSection"("beoId");

-- CreateIndex
CREATE INDEX "BEOMenuSection_responsiblePartyVendorId_idx" ON "BEOMenuSection"("responsiblePartyVendorId");

-- CreateIndex
CREATE INDEX "CateringOrderServiceLocation_cateringOrderId_idx" ON "CateringOrderServiceLocation"("cateringOrderId");

-- CreateIndex
CREATE INDEX "CateringOrderServiceLocation_functionId_idx" ON "CateringOrderServiceLocation"("functionId");

-- CreateIndex
CREATE UNIQUE INDEX "BEOContact_beoId_contactId_key" ON "BEOContact"("beoId", "contactId");

-- CreateIndex
CREATE INDEX "PresentationTrack_eventId_idx" ON "PresentationTrack"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "PresentationTrack_eventId_name_key" ON "PresentationTrack"("eventId", "name");

-- CreateIndex
CREATE INDEX "BreakoutGroup_eventId_idx" ON "BreakoutGroup"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "BreakoutGroupRoom_breakoutGroupId_roomId_key" ON "BreakoutGroupRoom"("breakoutGroupId", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "BreakoutSessionRoomOverride_functionId_roomId_key" ON "BreakoutSessionRoomOverride"("functionId", "roomId");

-- CreateIndex
CREATE INDEX "PresentationSlot_presentationId_idx" ON "PresentationSlot"("presentationId");

-- CreateIndex
CREATE UNIQUE INDEX "PresentationSlot_functionId_presentationId_key" ON "PresentationSlot"("functionId", "presentationId");

-- CreateIndex
CREATE INDEX "Presentation_eventId_idx" ON "Presentation"("eventId");

-- CreateIndex
CREATE INDEX "Presentation_trackId_idx" ON "Presentation"("trackId");

-- CreateIndex
CREATE INDEX "Presentation_breakoutGroupId_idx" ON "Presentation"("breakoutGroupId");

-- CreateIndex
CREATE INDEX "Presentation_updatedById_idx" ON "Presentation"("updatedById");

-- CreateIndex
CREATE INDEX "PresentationContact_presentationId_idx" ON "PresentationContact"("presentationId");

-- CreateIndex
CREATE UNIQUE INDEX "PresentationContact_presentationId_contactId_key" ON "PresentationContact"("presentationId", "contactId");

-- CreateIndex
CREATE INDEX "WorkflowTemplate_updatedById_idx" ON "WorkflowTemplate"("updatedById");

-- CreateIndex
CREATE INDEX "WorkflowStep_templateId_idx" ON "WorkflowStep"("templateId");

-- CreateIndex
CREATE INDEX "WorkflowChecklistItem_stepId_idx" ON "WorkflowChecklistItem"("stepId");

-- CreateIndex
CREATE INDEX "WorkflowInstance_entityType_entityId_idx" ON "WorkflowInstance"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowInstance_templateId_entityType_entityId_key" ON "WorkflowInstance"("templateId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStepCompletion_instanceId_stepId_key" ON "WorkflowStepCompletion"("instanceId", "stepId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowChecklistCompletion_instanceId_itemId_key" ON "WorkflowChecklistCompletion"("instanceId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_venueId_key" ON "Vendor"("venueId");

-- CreateIndex
CREATE INDEX "Vendor_updatedById_idx" ON "Vendor"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "VendorContact_vendorId_contactId_key" ON "VendorContact"("vendorId", "contactId");

-- CreateIndex
CREATE INDEX "EventVendor_eventId_idx" ON "EventVendor"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventVendor_eventId_vendorId_key" ON "EventVendor"("eventId", "vendorId");

-- CreateIndex
CREATE INDEX "AVOrderVendor_avOrderId_idx" ON "AVOrderVendor"("avOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "AVOrderVendor_avOrderId_vendorId_key" ON "AVOrderVendor"("avOrderId", "vendorId");

-- CreateIndex
CREATE INDEX "BEOVendor_beoId_idx" ON "BEOVendor"("beoId");

-- CreateIndex
CREATE UNIQUE INDEX "BEOVendor_beoId_vendorId_key" ON "BEOVendor"("beoId", "vendorId");

-- CreateIndex
CREATE INDEX "SetupOrderVendor_setupOrderId_idx" ON "SetupOrderVendor"("setupOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "SetupOrderVendor_setupOrderId_vendorId_key" ON "SetupOrderVendor"("setupOrderId", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "AudioSection_avOrderId_key" ON "AudioSection"("avOrderId");

-- CreateIndex
CREATE INDEX "InputGroup_audioSectionId_idx" ON "InputGroup"("audioSectionId");

-- CreateIndex
CREATE INDEX "InputItem_inputGroupId_idx" ON "InputItem"("inputGroupId");

-- CreateIndex
CREATE INDEX "InputItem_equipmentId_idx" ON "InputItem"("equipmentId");

-- CreateIndex
CREATE INDEX "MonitorMix_audioSectionId_idx" ON "MonitorMix"("audioSectionId");

-- CreateIndex
CREATE INDEX "MonitorMix_equipmentId_idx" ON "MonitorMix"("equipmentId");

-- CreateIndex
CREATE INDEX "MonitorOutput_monitorMixId_idx" ON "MonitorOutput"("monitorMixId");

-- CreateIndex
CREATE INDEX "MonitorOutput_equipmentId_idx" ON "MonitorOutput"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoSection_avOrderId_key" ON "VideoSection"("avOrderId");

-- CreateIndex
CREATE INDEX "MediaDeliverable_eventId_idx" ON "MediaDeliverable"("eventId");

-- CreateIndex
CREATE INDEX "MediaDeliverable_copiedFromId_idx" ON "MediaDeliverable"("copiedFromId");

-- CreateIndex
CREATE INDEX "MediaDeliverable_updatedById_idx" ON "MediaDeliverable"("updatedById");

-- CreateIndex
CREATE INDEX "MediaDeliverable_providerVendorId_idx" ON "MediaDeliverable"("providerVendorId");

-- CreateIndex
CREATE INDEX "MediaDeliverable_providerContactId_idx" ON "MediaDeliverable"("providerContactId");

-- CreateIndex
CREATE INDEX "MediaDeliverableFunction_functionId_idx" ON "MediaDeliverableFunction"("functionId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaDeliverableFunction_mediaDeliverableId_functionId_key" ON "MediaDeliverableFunction"("mediaDeliverableId", "functionId");

-- CreateIndex
CREATE INDEX "MediaDeliverablePresentation_presentationId_idx" ON "MediaDeliverablePresentation"("presentationId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaDeliverablePresentation_mediaDeliverableId_presentatio_key" ON "MediaDeliverablePresentation"("mediaDeliverableId", "presentationId");

-- CreateIndex
CREATE INDEX "MediaDeliverableContact_contactId_idx" ON "MediaDeliverableContact"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaDeliverableContact_mediaDeliverableId_contactId_key" ON "MediaDeliverableContact"("mediaDeliverableId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "PrintOrder_presentationId_key" ON "PrintOrder"("presentationId");

-- CreateIndex
CREATE INDEX "PrintOrder_eventId_idx" ON "PrintOrder"("eventId");

-- CreateIndex
CREATE INDEX "PrintOrder_roomId_idx" ON "PrintOrder"("roomId");

-- CreateIndex
CREATE INDEX "PrintOrder_updatedById_idx" ON "PrintOrder"("updatedById");

-- CreateIndex
CREATE INDEX "PrintOrderFunction_functionId_idx" ON "PrintOrderFunction"("functionId");

-- CreateIndex
CREATE UNIQUE INDEX "PrintOrderFunction_printOrderId_functionId_key" ON "PrintOrderFunction"("printOrderId", "functionId");

-- CreateIndex
CREATE INDEX "PrintItem_printOrderId_idx" ON "PrintItem"("printOrderId");

-- CreateIndex
CREATE INDEX "PrintItem_designerVendorId_idx" ON "PrintItem"("designerVendorId");

-- CreateIndex
CREATE INDEX "PrintItem_designerContactId_idx" ON "PrintItem"("designerContactId");

-- CreateIndex
CREATE INDEX "PrintItem_printerVendorId_idx" ON "PrintItem"("printerVendorId");

-- CreateIndex
CREATE INDEX "PrintItem_printerContactId_idx" ON "PrintItem"("printerContactId");

-- CreateIndex
CREATE INDEX "PrintItem_sourceLocationId_idx" ON "PrintItem"("sourceLocationId");

-- CreateIndex
CREATE INDEX "PrintOrderVendor_printOrderId_idx" ON "PrintOrderVendor"("printOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PrintOrderVendor_printOrderId_vendorId_key" ON "PrintOrderVendor"("printOrderId", "vendorId");

-- CreateIndex
CREATE INDEX "SupplyOrder_eventId_idx" ON "SupplyOrder"("eventId");

-- CreateIndex
CREATE INDEX "SupplyOrder_roomId_idx" ON "SupplyOrder"("roomId");

-- CreateIndex
CREATE INDEX "SupplyOrder_updatedById_idx" ON "SupplyOrder"("updatedById");

-- CreateIndex
CREATE INDEX "SupplyOrder_providerVendorId_idx" ON "SupplyOrder"("providerVendorId");

-- CreateIndex
CREATE INDEX "SupplyOrder_providerContactId_idx" ON "SupplyOrder"("providerContactId");

-- CreateIndex
CREATE INDEX "SupplyOrderItem_supplyOrderId_idx" ON "SupplyOrderItem"("supplyOrderId");

-- CreateIndex
CREATE INDEX "SupplyOrderItem_equipmentId_idx" ON "SupplyOrderItem"("equipmentId");

-- CreateIndex
CREATE INDEX "SupplyOrderItem_providerVendorId_idx" ON "SupplyOrderItem"("providerVendorId");

-- CreateIndex
CREATE INDEX "SupplyOrderItem_providerContactId_idx" ON "SupplyOrderItem"("providerContactId");

-- CreateIndex
CREATE INDEX "SupplyOrderItem_sourceLocationId_idx" ON "SupplyOrderItem"("sourceLocationId");

-- CreateIndex
CREATE INDEX "SupplyOrderItem_containerLocationId_idx" ON "SupplyOrderItem"("containerLocationId");

-- CreateIndex
CREATE INDEX "SupplyOrderItem_inventoryItemId_idx" ON "SupplyOrderItem"("inventoryItemId");

-- CreateIndex
CREATE INDEX "SupplyOrderFunction_functionId_idx" ON "SupplyOrderFunction"("functionId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyOrderFunction_supplyOrderId_functionId_key" ON "SupplyOrderFunction"("supplyOrderId", "functionId");

-- CreateIndex
CREATE INDEX "SupplyOrderPresentation_presentationId_idx" ON "SupplyOrderPresentation"("presentationId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyOrderPresentation_supplyOrderId_presentationId_key" ON "SupplyOrderPresentation"("supplyOrderId", "presentationId");

-- CreateIndex
CREATE INDEX "FileUpload_eventId_idx" ON "FileUpload"("eventId");

-- CreateIndex
CREATE INDEX "FileUpload_cateringOrderId_idx" ON "FileUpload"("cateringOrderId");

-- CreateIndex
CREATE INDEX "FileUpload_avOrderId_idx" ON "FileUpload"("avOrderId");

-- CreateIndex
CREATE INDEX "FileUpload_setupOrderId_idx" ON "FileUpload"("setupOrderId");

-- CreateIndex
CREATE INDEX "FileUpload_printOrderId_idx" ON "FileUpload"("printOrderId");

-- CreateIndex
CREATE INDEX "FileUpload_supplyOrderId_idx" ON "FileUpload"("supplyOrderId");

-- CreateIndex
CREATE INDEX "FileUpload_mediaDeliverableId_idx" ON "FileUpload"("mediaDeliverableId");

-- CreateIndex
CREATE INDEX "FileUpload_venueId_idx" ON "FileUpload"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");

-- CreateIndex
CREATE INDEX "ShareLink_eventId_idx" ON "ShareLink"("eventId");

-- CreateIndex
CREATE INDEX "ShareLink_token_idx" ON "ShareLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLinkGroup_token_key" ON "ShareLinkGroup"("token");

-- CreateIndex
CREATE INDEX "ShareLinkGroup_eventId_idx" ON "ShareLinkGroup"("eventId");

-- CreateIndex
CREATE INDEX "ShareLinkGroup_token_idx" ON "ShareLinkGroup"("token");

-- CreateIndex
CREATE INDEX "ShareLinkGroupItem_groupId_sortOrder_idx" ON "ShareLinkGroupItem"("groupId", "sortOrder");

-- CreateIndex
CREATE INDEX "EventStatusDefault_eventId_idx" ON "EventStatusDefault"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventStatusDefault_eventId_modelType_key" ON "EventStatusDefault"("eventId", "modelType");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE INDEX "Role_updatedById_idx" ON "Role"("updatedById");

-- CreateIndex
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_resource_scope_key" ON "RolePermission"("roleId", "resource", "scope");

-- CreateIndex
CREATE INDEX "EventStaff_eventId_idx" ON "EventStaff"("eventId");

-- CreateIndex
CREATE INDEX "EventStaff_userId_idx" ON "EventStaff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventStaff_userId_eventId_key" ON "EventStaff"("userId", "eventId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthRefreshToken" ADD CONSTRAINT "OAuthRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSetting" ADD CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageLocation" ADD CONSTRAINT "StorageLocation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "StorageLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomGroup" ADD CONSTRAINT "RoomGroup_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "RoomGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueContact" ADD CONSTRAINT "VenueContact_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueContact" ADD CONSTRAINT "VenueContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventKeyStaff" ADD CONSTRAINT "EventKeyStaff_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventKeyStaff" ADD CONSTRAINT "EventKeyStaff_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Function" ADD CONSTRAINT "Function_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Function" ADD CONSTRAINT "Function_breakoutGroupId_fkey" FOREIGN KEY ("breakoutGroupId") REFERENCES "BreakoutGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Function" ADD CONSTRAINT "Function_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunctionSchedule" ADD CONSTRAINT "FunctionSchedule_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunctionRoom" ADD CONSTRAINT "FunctionRoom_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunctionRoom" ADD CONSTRAINT "FunctionRoom_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunctionContact" ADD CONSTRAINT "FunctionContact_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunctionContact" ADD CONSTRAINT "FunctionContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AVOrder" ADD CONSTRAINT "AVOrder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AVOrder" ADD CONSTRAINT "AVOrder_copiedFromId_fkey" FOREIGN KEY ("copiedFromId") REFERENCES "AVOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AVOrder" ADD CONSTRAINT "AVOrder_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AVOrderFunction" ADD CONSTRAINT "AVOrderFunction_avOrderId_fkey" FOREIGN KEY ("avOrderId") REFERENCES "AVOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AVOrderFunction" ADD CONSTRAINT "AVOrderFunction_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AVOrderPresentation" ADD CONSTRAINT "AVOrderPresentation_avOrderId_fkey" FOREIGN KEY ("avOrderId") REFERENCES "AVOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AVOrderPresentation" ADD CONSTRAINT "AVOrderPresentation_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BEO" ADD CONSTRAINT "BEO_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BEO" ADD CONSTRAINT "BEO_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BEO" ADD CONSTRAINT "BEO_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineItem" ADD CONSTRAINT "TimelineItem_cateringOrderId_fkey" FOREIGN KEY ("cateringOrderId") REFERENCES "BEO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineItem" ADD CONSTRAINT "TimelineItem_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_cateringOrderId_fkey" FOREIGN KEY ("cateringOrderId") REFERENCES "BEO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_setupOrderId_fkey" FOREIGN KEY ("setupOrderId") REFERENCES "SetupOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_videoSectionId_fkey" FOREIGN KEY ("videoSectionId") REFERENCES "VideoSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_avOrderId_fkey" FOREIGN KEY ("avOrderId") REFERENCES "AVOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_providerVendorId_fkey" FOREIGN KEY ("providerVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_providerContactId_fkey" FOREIGN KEY ("providerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_operatorVendorId_fkey" FOREIGN KEY ("operatorVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_operatorContactId_fkey" FOREIGN KEY ("operatorContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupOrder" ADD CONSTRAINT "SetupOrder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupOrder" ADD CONSTRAINT "SetupOrder_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupOrder" ADD CONSTRAINT "SetupOrder_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupOrderFunction" ADD CONSTRAINT "SetupOrderFunction_setupOrderId_fkey" FOREIGN KEY ("setupOrderId") REFERENCES "SetupOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupOrderFunction" ADD CONSTRAINT "SetupOrderFunction_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupOrderPresentation" ADD CONSTRAINT "SetupOrderPresentation_setupOrderId_fkey" FOREIGN KEY ("setupOrderId") REFERENCES "SetupOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupOrderPresentation" ADD CONSTRAINT "SetupOrderPresentation_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupTable" ADD CONSTRAINT "SetupTable_setupOrderId_fkey" FOREIGN KEY ("setupOrderId") REFERENCES "SetupOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupTable" ADD CONSTRAINT "SetupTable_providerVendorId_fkey" FOREIGN KEY ("providerVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupOrderDetail" ADD CONSTRAINT "SetupOrderDetail_setupOrderId_fkey" FOREIGN KEY ("setupOrderId") REFERENCES "SetupOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupOrderDetail" ADD CONSTRAINT "SetupOrderDetail_responsiblePartyVendorId_fkey" FOREIGN KEY ("responsiblePartyVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BEOLineItem" ADD CONSTRAINT "BEOLineItem_beoId_fkey" FOREIGN KEY ("beoId") REFERENCES "BEO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BEOMenuSection" ADD CONSTRAINT "BEOMenuSection_beoId_fkey" FOREIGN KEY ("beoId") REFERENCES "BEO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BEOMenuSection" ADD CONSTRAINT "BEOMenuSection_responsiblePartyVendorId_fkey" FOREIGN KEY ("responsiblePartyVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CateringOrderServiceLocation" ADD CONSTRAINT "CateringOrderServiceLocation_cateringOrderId_fkey" FOREIGN KEY ("cateringOrderId") REFERENCES "BEO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CateringOrderServiceLocation" ADD CONSTRAINT "CateringOrderServiceLocation_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BEOContact" ADD CONSTRAINT "BEOContact_beoId_fkey" FOREIGN KEY ("beoId") REFERENCES "BEO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BEOContact" ADD CONSTRAINT "BEOContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationTrack" ADD CONSTRAINT "PresentationTrack_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakoutGroup" ADD CONSTRAINT "BreakoutGroup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakoutGroupRoom" ADD CONSTRAINT "BreakoutGroupRoom_breakoutGroupId_fkey" FOREIGN KEY ("breakoutGroupId") REFERENCES "BreakoutGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakoutGroupRoom" ADD CONSTRAINT "BreakoutGroupRoom_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakoutSessionRoomOverride" ADD CONSTRAINT "BreakoutSessionRoomOverride_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakoutSessionRoomOverride" ADD CONSTRAINT "BreakoutSessionRoomOverride_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationSlot" ADD CONSTRAINT "PresentationSlot_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationSlot" ADD CONSTRAINT "PresentationSlot_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationSlot" ADD CONSTRAINT "PresentationSlot_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationSlot" ADD CONSTRAINT "PresentationSlot_advancerVendorId_fkey" FOREIGN KEY ("advancerVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationSlot" ADD CONSTRAINT "PresentationSlot_advancerContactId_fkey" FOREIGN KEY ("advancerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "PresentationTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_breakoutGroupId_fkey" FOREIGN KEY ("breakoutGroupId") REFERENCES "BreakoutGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_advancerVendorId_fkey" FOREIGN KEY ("advancerVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_advancerContactId_fkey" FOREIGN KEY ("advancerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationContact" ADD CONSTRAINT "PresentationContact_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentationContact" ADD CONSTRAINT "PresentationContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTemplate" ADD CONSTRAINT "WorkflowTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowChecklistItem" ADD CONSTRAINT "WorkflowChecklistItem_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "WorkflowStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStepCompletion" ADD CONSTRAINT "WorkflowStepCompletion_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStepCompletion" ADD CONSTRAINT "WorkflowStepCompletion_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "WorkflowStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowChecklistCompletion" ADD CONSTRAINT "WorkflowChecklistCompletion_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowChecklistCompletion" ADD CONSTRAINT "WorkflowChecklistCompletion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "WorkflowChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorContact" ADD CONSTRAINT "VendorContact_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorContact" ADD CONSTRAINT "VendorContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVendor" ADD CONSTRAINT "EventVendor_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVendor" ADD CONSTRAINT "EventVendor_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AVOrderVendor" ADD CONSTRAINT "AVOrderVendor_avOrderId_fkey" FOREIGN KEY ("avOrderId") REFERENCES "AVOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AVOrderVendor" ADD CONSTRAINT "AVOrderVendor_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BEOVendor" ADD CONSTRAINT "BEOVendor_beoId_fkey" FOREIGN KEY ("beoId") REFERENCES "BEO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BEOVendor" ADD CONSTRAINT "BEOVendor_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupOrderVendor" ADD CONSTRAINT "SetupOrderVendor_setupOrderId_fkey" FOREIGN KEY ("setupOrderId") REFERENCES "SetupOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupOrderVendor" ADD CONSTRAINT "SetupOrderVendor_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioSection" ADD CONSTRAINT "AudioSection_avOrderId_fkey" FOREIGN KEY ("avOrderId") REFERENCES "AVOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputGroup" ADD CONSTRAINT "InputGroup_audioSectionId_fkey" FOREIGN KEY ("audioSectionId") REFERENCES "AudioSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputGroup" ADD CONSTRAINT "InputGroup_providerVendorId_fkey" FOREIGN KEY ("providerVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputGroup" ADD CONSTRAINT "InputGroup_providerContactId_fkey" FOREIGN KEY ("providerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputGroup" ADD CONSTRAINT "InputGroup_operatorVendorId_fkey" FOREIGN KEY ("operatorVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputGroup" ADD CONSTRAINT "InputGroup_operatorContactId_fkey" FOREIGN KEY ("operatorContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputItem" ADD CONSTRAINT "InputItem_inputGroupId_fkey" FOREIGN KEY ("inputGroupId") REFERENCES "InputGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputItem" ADD CONSTRAINT "InputItem_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputItem" ADD CONSTRAINT "InputItem_providerVendorId_fkey" FOREIGN KEY ("providerVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputItem" ADD CONSTRAINT "InputItem_providerContactId_fkey" FOREIGN KEY ("providerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputItem" ADD CONSTRAINT "InputItem_operatorVendorId_fkey" FOREIGN KEY ("operatorVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputItem" ADD CONSTRAINT "InputItem_operatorContactId_fkey" FOREIGN KEY ("operatorContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorMix" ADD CONSTRAINT "MonitorMix_audioSectionId_fkey" FOREIGN KEY ("audioSectionId") REFERENCES "AudioSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorMix" ADD CONSTRAINT "MonitorMix_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorMix" ADD CONSTRAINT "MonitorMix_providerVendorId_fkey" FOREIGN KEY ("providerVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorMix" ADD CONSTRAINT "MonitorMix_providerContactId_fkey" FOREIGN KEY ("providerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorMix" ADD CONSTRAINT "MonitorMix_operatorVendorId_fkey" FOREIGN KEY ("operatorVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorMix" ADD CONSTRAINT "MonitorMix_operatorContactId_fkey" FOREIGN KEY ("operatorContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorOutput" ADD CONSTRAINT "MonitorOutput_monitorMixId_fkey" FOREIGN KEY ("monitorMixId") REFERENCES "MonitorMix"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorOutput" ADD CONSTRAINT "MonitorOutput_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorOutput" ADD CONSTRAINT "MonitorOutput_providerVendorId_fkey" FOREIGN KEY ("providerVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorOutput" ADD CONSTRAINT "MonitorOutput_providerContactId_fkey" FOREIGN KEY ("providerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorOutput" ADD CONSTRAINT "MonitorOutput_operatorVendorId_fkey" FOREIGN KEY ("operatorVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorOutput" ADD CONSTRAINT "MonitorOutput_operatorContactId_fkey" FOREIGN KEY ("operatorContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoSection" ADD CONSTRAINT "VideoSection_avOrderId_fkey" FOREIGN KEY ("avOrderId") REFERENCES "AVOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaDeliverable" ADD CONSTRAINT "MediaDeliverable_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaDeliverable" ADD CONSTRAINT "MediaDeliverable_copiedFromId_fkey" FOREIGN KEY ("copiedFromId") REFERENCES "MediaDeliverable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaDeliverable" ADD CONSTRAINT "MediaDeliverable_providerVendorId_fkey" FOREIGN KEY ("providerVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaDeliverable" ADD CONSTRAINT "MediaDeliverable_providerContactId_fkey" FOREIGN KEY ("providerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaDeliverable" ADD CONSTRAINT "MediaDeliverable_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaDeliverableFunction" ADD CONSTRAINT "MediaDeliverableFunction_mediaDeliverableId_fkey" FOREIGN KEY ("mediaDeliverableId") REFERENCES "MediaDeliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaDeliverableFunction" ADD CONSTRAINT "MediaDeliverableFunction_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaDeliverablePresentation" ADD CONSTRAINT "MediaDeliverablePresentation_mediaDeliverableId_fkey" FOREIGN KEY ("mediaDeliverableId") REFERENCES "MediaDeliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaDeliverablePresentation" ADD CONSTRAINT "MediaDeliverablePresentation_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaDeliverableContact" ADD CONSTRAINT "MediaDeliverableContact_mediaDeliverableId_fkey" FOREIGN KEY ("mediaDeliverableId") REFERENCES "MediaDeliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaDeliverableContact" ADD CONSTRAINT "MediaDeliverableContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintOrder" ADD CONSTRAINT "PrintOrder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintOrder" ADD CONSTRAINT "PrintOrder_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintOrder" ADD CONSTRAINT "PrintOrder_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintOrder" ADD CONSTRAINT "PrintOrder_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintOrderFunction" ADD CONSTRAINT "PrintOrderFunction_printOrderId_fkey" FOREIGN KEY ("printOrderId") REFERENCES "PrintOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintOrderFunction" ADD CONSTRAINT "PrintOrderFunction_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintItem" ADD CONSTRAINT "PrintItem_printOrderId_fkey" FOREIGN KEY ("printOrderId") REFERENCES "PrintOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintItem" ADD CONSTRAINT "PrintItem_designerVendorId_fkey" FOREIGN KEY ("designerVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintItem" ADD CONSTRAINT "PrintItem_designerContactId_fkey" FOREIGN KEY ("designerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintItem" ADD CONSTRAINT "PrintItem_printerVendorId_fkey" FOREIGN KEY ("printerVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintItem" ADD CONSTRAINT "PrintItem_printerContactId_fkey" FOREIGN KEY ("printerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintItem" ADD CONSTRAINT "PrintItem_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintOrderVendor" ADD CONSTRAINT "PrintOrderVendor_printOrderId_fkey" FOREIGN KEY ("printOrderId") REFERENCES "PrintOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintOrderVendor" ADD CONSTRAINT "PrintOrderVendor_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrder" ADD CONSTRAINT "SupplyOrder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrder" ADD CONSTRAINT "SupplyOrder_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrder" ADD CONSTRAINT "SupplyOrder_providerVendorId_fkey" FOREIGN KEY ("providerVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrder" ADD CONSTRAINT "SupplyOrder_providerContactId_fkey" FOREIGN KEY ("providerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrder" ADD CONSTRAINT "SupplyOrder_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrderItem" ADD CONSTRAINT "SupplyOrderItem_supplyOrderId_fkey" FOREIGN KEY ("supplyOrderId") REFERENCES "SupplyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrderItem" ADD CONSTRAINT "SupplyOrderItem_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrderItem" ADD CONSTRAINT "SupplyOrderItem_providerVendorId_fkey" FOREIGN KEY ("providerVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrderItem" ADD CONSTRAINT "SupplyOrderItem_providerContactId_fkey" FOREIGN KEY ("providerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrderItem" ADD CONSTRAINT "SupplyOrderItem_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrderItem" ADD CONSTRAINT "SupplyOrderItem_containerLocationId_fkey" FOREIGN KEY ("containerLocationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrderItem" ADD CONSTRAINT "SupplyOrderItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrderFunction" ADD CONSTRAINT "SupplyOrderFunction_supplyOrderId_fkey" FOREIGN KEY ("supplyOrderId") REFERENCES "SupplyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrderFunction" ADD CONSTRAINT "SupplyOrderFunction_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrderPresentation" ADD CONSTRAINT "SupplyOrderPresentation_supplyOrderId_fkey" FOREIGN KEY ("supplyOrderId") REFERENCES "SupplyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrderPresentation" ADD CONSTRAINT "SupplyOrderPresentation_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_cateringOrderId_fkey" FOREIGN KEY ("cateringOrderId") REFERENCES "BEO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_avOrderId_fkey" FOREIGN KEY ("avOrderId") REFERENCES "AVOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_setupOrderId_fkey" FOREIGN KEY ("setupOrderId") REFERENCES "SetupOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_printOrderId_fkey" FOREIGN KEY ("printOrderId") REFERENCES "PrintOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_supplyOrderId_fkey" FOREIGN KEY ("supplyOrderId") REFERENCES "SupplyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_mediaDeliverableId_fkey" FOREIGN KEY ("mediaDeliverableId") REFERENCES "MediaDeliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLinkGroup" ADD CONSTRAINT "ShareLinkGroup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLinkGroup" ADD CONSTRAINT "ShareLinkGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLinkGroupItem" ADD CONSTRAINT "ShareLinkGroupItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ShareLinkGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStatusDefault" ADD CONSTRAINT "EventStatusDefault_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStaff" ADD CONSTRAINT "EventStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStaff" ADD CONSTRAINT "EventStaff_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

