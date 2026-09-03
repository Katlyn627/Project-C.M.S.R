'use strict';

/**
 * Mock SMS/USSD notification service.
 * In production, replace sendSms with a real gateway (e.g. Africa's Talking, Twilio).
 */

const { getDb } = require('../db/database');

function sendSms(phone, message, notificationType) {
  const db = getDb();
  // Log notification to database
  const result = db.prepare(`
    INSERT INTO sms_notifications (recipient_phone, message, notification_type, status, sent_at)
    VALUES (?, ?, ?, 'sent', datetime('now'))
  `).run(phone, message, notificationType);

  // Mock: log to console (replace with gateway SDK call in production)
  console.log(`[SMS MOCK] To: ${phone} | Type: ${notificationType} | Message: ${message}`);

  return { id: result.lastInsertRowid, status: 'sent' };
}

function notifyVolunteerShiftReminder(volunteer, shift) {
  const msg = `CMSR: Reminder - you have a ${shift.shift_type} shift on ${shift.scheduled_date} at ${shift.start_time}. Reply CONFIRM or CANCEL.`;
  return sendSms(volunteer.phone, msg, 'shift_reminder');
}

function notifyParentSafeArrival(parentPhone, childName, location) {
  const msg = `CMSR: ${childName} has safely arrived at ${location}. Thank you for using Safe Route.`;
  return sendSms(parentPhone, msg, 'safe_arrival');
}

function notifyCoordinatorIncident(coordinatorPhone, incidentId, severity) {
  const msg = `CMSR ALERT: New ${severity} incident #${incidentId} reported. Please review immediately.`;
  return sendSms(coordinatorPhone, msg, 'incident_alert');
}

module.exports = {
  sendSms,
  notifyVolunteerShiftReminder,
  notifyParentSafeArrival,
  notifyCoordinatorIncident,
};
