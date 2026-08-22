import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolveDayTypeForDate, deriveAmbientRoutineStatus } from "../src/lib/familyRoutines.ts"

const mockEmmeRoutine = {
  memberId: "child-emme-id",
  title: "School Routine",
  routineType: "school",
  venueName: "Palm Beach Public Elementary School",
  venueAddress: "239 Cocoanut Row, Palm Beach, FL 33480",
  daysOfWeek: [1, 2, 3, 4, 5],
  startLocal: "08:00",
  endLocal: "14:00",
  dropoffDriverName: "Jake",
  pickupDriverName: "Giselle",
  enabled: true,
}

const mockLivRoutine = {
  memberId: "child-liv-id",
  title: "School Routine",
  routineType: "school",
  venueName: "Bak Middle School of the Arts",
  venueAddress: "1725 Echo Lake Dr, West Palm Beach, FL",
  daysOfWeek: [1, 2, 3, 4, 5],
  startLocal: "08:00",
  endLocal: "15:30",
  dropoffDriverName: "Kelly",
  pickupDriverName: "Giselle",
  enabled: true,
}

const mockChildren = [
  { id: "child-emme-id", name: "Emme" },
  { id: "child-liv-id", name: "Liv" },
]

test("deriveAmbientRoutineStatus returns empty array on Saturday and Sunday", () => {
  const saturdayNoon = new Date("2026-08-22T12:00:00.000-04:00") // Sat
  const sundayNoon = new Date("2026-08-23T12:00:00.000-04:00") // Sun

  const satStatuses = deriveAmbientRoutineStatus([mockEmmeRoutine, mockLivRoutine], mockChildren, saturdayNoon)
  const sunStatuses = deriveAmbientRoutineStatus([mockEmmeRoutine, mockLivRoutine], mockChildren, sundayNoon)

  assert.equal(satStatuses.length, 0)
  assert.equal(sunStatuses.length, 0)
})

test("MiddayLogisticsWidget code integrity: no hardcoded school dismissal fallbacks and checks weekend", () => {
  const widgetCode = readFileSync("src/components/canvas/widgets/MiddayLogisticsWidget.tsx", "utf-8")

  // Must not have hardcoded mock school fallbacks
  assert.ok(!widgetCode.includes("pbp-dismissal"), "Widget must not contain hardcoded pbp-dismissal fallback")
  assert.ok(!widgetCode.includes("bak-dismissal"), "Widget must not contain hardcoded bak-dismissal fallback")

  // Must check for weekend / school day
  assert.ok(widgetCode.includes("routineIntel.isTodayWeekend"), "Widget must check routineIntel.isTodayWeekend")
  assert.ok(widgetCode.includes("routineIntel.isTodaySchoolDay"), "Widget must check routineIntel.isTodaySchoolDay")

  // Must only render school dismissals section when schoolDismissals.length > 0
  assert.ok(widgetCode.includes("schoolDismissals.length > 0"), "Widget must conditionally render school dismissals only when length > 0")
})
