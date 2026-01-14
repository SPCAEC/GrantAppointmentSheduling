function getCancelEmailRecipients_() {
  const raw = PropertiesService.getScriptProperties().getProperty('CANCEL_EMAIL_RECIPIENTS') || '';
  return raw.split(/[;,]/g).map(s => s.trim()).filter(Boolean);
}

function sendCancelEmail_(appt) {
  const recipients = getCancelEmailRecipients_();
  if (!recipients.length) {
    console.warn('CANCEL_EMAIL_RECIPIENTS is empty; skipping cancel email.');
    return;
  }

  const subject = 'Grant Appointment Cancellation';

  const body =
`Hello Lipsey team,

This is an automated email from your friendly Pet Helper Pro. The following appointment has been canceled and the client has been notified. Unless otherwise told, please make this appointment slot available for a grant client again.

Reply ALL with questions!

Appointment Details
Date: ${appt.date}
Appointment Type: ${appt.type}
Time: ${appt.time}
`;

  const to = recipients[0];
  const cc = recipients.slice(1).join(',');

  GmailApp.sendEmail(to, subject, body, {
    cc: cc || undefined,
    name: 'Pet Helper Pro',
    replyTo: 'yourspcaoutreachteam@gmail.com'
  });
}