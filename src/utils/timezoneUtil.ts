// export function calculateTimezoneDelay(targetTimezone: string,targetTime?: { hours: number; minutes: number; seconds?: number }): number {
//   // Parse timezone offset from string
//   const timezoneOffset = parseTimezoneOffset(targetTimezone);
  
//   // Get current server time
//   const serverTime = new Date();
//   const serverOffsetMinutes = serverTime.getTimezoneOffset(); // Server offset in minutes (negative for ahead of UTC)
  
//   // Convert target timezone offset to minutes
//   const targetOffsetMinutes = timezoneOffset * 60;
  
//   // Calculate the difference between server and target timezone in minutes
//   const timezoneDifferenceMinutes = targetOffsetMinutes + serverOffsetMinutes;
  
//   if (targetTime) {
//     // If specific time is provided, calculate delay to that time in target timezone
//     const targetDateTime = new Date(serverTime);
    
//     // Set the target time
//     targetDateTime.setHours(targetTime.hours, targetTime.minutes, targetTime.seconds || 0, 0);
    
//     // Adjust for timezone difference
//     targetDateTime.setMinutes(targetDateTime.getMinutes() - timezoneDifferenceMinutes);
    
//     // If the target time has already passed today, schedule for tomorrow
//     if (targetDateTime <= serverTime) {
//       targetDateTime.setDate(targetDateTime.getDate() + 1);
//     }
    
//     return targetDateTime.getTime() - serverTime.getTime();
//   } else {
//     // Return the timezone difference in milliseconds
//     return timezoneDifferenceMinutes * 60 * 1000;
//   }
// }

// function parseTimezoneOffset(timezoneString: string): number {
//   // Remove any parentheses and extra spaces
//   const cleanString = timezoneString.replace(/[()]/g, '').trim();
  
//   // Match different timezone formats
//   const patterns = [
//     /GMT([+-]\d{1,2}):?(\d{2})/i,           // GMT+5:30, GMT-10:00
//     /UTC([+-]\d{1,2}):?(\d{2})/i,           // UTC+5:30, UTC-10:00
//     /([+-]\d{1,2}):(\d{2})/,                // +05:30, -10:00
//     /([+-]\d{4})/,                          // +0530, -1000
//     /([+-]\d{1,2})$/                        // +5, -10
//   ];
  
//   for (const pattern of patterns) {
//     const match = cleanString.match(pattern);
//     if (match) {
//       if (match[1] && match[2]) {
//         // Format with hours and minutes
//         const hours = parseInt(match[1]);
//         const minutes = parseInt(match[2]);
//         return hours + (hours >= 0 ? minutes / 60 : -minutes / 60);
//       } else if (match[1] && match[1].length === 5) {
//         // Format like +0530 or -1000
//         const offsetString = match[1];
//         const hours = parseInt(offsetString.substring(0, 3));
//         const minutes = parseInt(offsetString.substring(3));
//         return hours + (hours >= 0 ? minutes / 60 : -minutes / 60);
//       } else if (match[1]) {
//         // Format with only hours
//         return parseInt(match[1]);
//       }
//     }
//   }
  
//   throw new Error(`Unable to parse timezone offset from: ${timezoneString}`);
// }

import { DateTime } from "luxon";

function calculateTimezoneDelay(
  targetZone: string,
  targetDateTimeString?: string
): number {
  const nowInTargetZone = DateTime.now().setZone(targetZone); // current time in target zone
  
  let targetDateTime: DateTime;
  
  if (targetDateTimeString) {
    // Remove timezone information from the string
    // This handles formats like "Mon Sep 01 2025 11:20:00 GMT+0530 (India Standard Time)"
    let cleanDateTimeString = targetDateTimeString
      .replace(/\s+GMT[+-]\d{4}.*$/, '') // Remove GMT+/-XXXX and everything after
      .replace(/\s+\([^)]*\)$/, '')      // Remove (timezone name) if present
      .trim();
    
    try {
      // Try parsing the cleaned string with Luxon
      let parsed = DateTime.fromFormat(cleanDateTimeString, "ccc MMM dd yyyy HH:mm:ss");
      
      // If that doesn't work, try other common formats
      if (!parsed.isValid) {
        parsed = DateTime.fromISO(cleanDateTimeString);
      }
      
      if (!parsed.isValid) {
        parsed = DateTime.fromJSDate(new Date(cleanDateTimeString));
      }
      
      if (!parsed.isValid) {
        throw new Error("Unable to parse cleaned datetime string");
      }
      
      // Create target datetime using parsed components in target zone
      targetDateTime = DateTime.fromObject(
        {
          year: parsed.year,
          month: parsed.month,
          day: parsed.day,
          hour: parsed.hour,
          minute: parsed.minute,
          second: parsed.second,
          millisecond: parsed.millisecond || 0,
        },
        { zone: targetZone }
      );
      
    } catch (error) {
      throw new Error(`Invalid datetime string: ${targetDateTimeString}`);
    }
    
    console.log("target date time => ",targetDateTime);
    console.log("current date time =>",nowInTargetZone);
    // If that time has already passed in the target zone
    if (targetDateTime <= nowInTargetZone) {
      return -1; // expired
    }
  } else {
    // If no target time specified, return 0 (no delay)
    return 0;
  }
  
  // Calculate delay in ms between current time in target zone and target time
  // Both times are in the same timezone, so the calculation is straightforward
  return targetDateTime.toMillis() - nowInTargetZone.toMillis();
}


export {calculateTimezoneDelay}




