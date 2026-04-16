const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// Optional callable used by the mobile app. Safe no-op stub.
exports.linkPreview = functions.https.onCall(async () => {
  return null;
});
