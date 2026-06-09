/**
 * Timezone utilities for consistent date handling across the application
 */

/**
 * Get the start of day in a specific timezone and return as UTC
 * @param timezone - IANA timezone string (e.g., 'America/New_York')
 * @returns Date object representing start of day in the timezone, converted to UTC
 */
export function getStartOfDayInTimezone(timezone: string): Date {
  const now = new Date();

  // Create a date object representing "now" in the user's timezone
  const nowInTimezone = new Date(
    now.toLocaleString("en-US", { timeZone: timezone })
  );

  // Get the current UTC time
  const nowUTC = new Date(now.toISOString());

  // Calculate the timezone offset
  const timezoneOffset = nowUTC.getTime() - nowInTimezone.getTime();

  // Create start of day in the user's timezone
  const startOfDayLocal = new Date(nowInTimezone);
  startOfDayLocal.setHours(0, 0, 0, 0);

  // Convert back to UTC for database queries
  return new Date(startOfDayLocal.getTime() + timezoneOffset);
}

/**
 * Get the start of week in a specific timezone and return as UTC
 * @param timezone - IANA timezone string (e.g., 'America/New_York')
 * @returns Date object representing start of week (Monday) in the timezone, converted to UTC
 */
export function getStartOfWeekInTimezone(timezone: string): Date {
  const now = new Date();

  // Create a date object representing "now" in the user's timezone
  const nowInTimezone = new Date(
    now.toLocaleString("en-US", { timeZone: timezone })
  );

  // Get the current UTC time
  const nowUTC = new Date(now.toISOString());

  // Calculate the timezone offset
  const timezoneOffset = nowUTC.getTime() - nowInTimezone.getTime();

  // Days back to Monday: getDay() returns 0 for Sunday, 1 for Monday, ...
  // On Sunday we go back 6 days; otherwise getDay() - 1.
  const dayOfWeek = nowInTimezone.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const startOfWeekLocal = new Date(nowInTimezone);
  startOfWeekLocal.setDate(nowInTimezone.getDate() - daysToMonday);
  startOfWeekLocal.setHours(0, 0, 0, 0);

  // Convert back to UTC for database queries
  return new Date(startOfWeekLocal.getTime() + timezoneOffset);
}

/**
 * Validate a timezone string
 * @param timezone - IANA timezone string to validate
 * @returns boolean indicating if the timezone is valid
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get the user's current timezone
 * @returns IANA timezone string for the user's current timezone
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
