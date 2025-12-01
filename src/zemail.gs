function sendAppointmentChangeEmail_(payload) {
  try {
    const props = PropertiesService.getScriptProperties();
    const list = (props.getProperty('APPOINTMENT_CHANGE_EMAIL') || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    if (!list.length) {
      Logger.log('sendAppointmentChangeEmail_: No recipients found');
      return;
    }

    const first = payload['First Name'] || '';
    const last  = payload['Last Name'] || '';
    const pet   = payload['Pet Name'] || '';
    const date  = payload['Date'] || '';
    const time  = payload['Time'] || '';
    const ampm  = payload['AM or PM'] || '';
    const species= payload['Species'] || '';

    const subject = `Appointment Change - ${first} ${last}`;
    const html = `
      <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;line-height:1.5;">
        <h2 style="margin:0 0 .25rem 0;">Appointment Updated</h2>
        <p style="margin:.25rem 0 .75rem 0;">The following appointment was modified.</p>
        <table style="border-collapse:collapse;width:100%;max-width:520px;">
          <tr><td style="padding:6px 8px;border:1px solid #e5e7eb;"><strong>Client</strong></td><td style="padding:6px 8px;border:1px solid #e5e7eb;">${first} ${last}</td></tr>
          <tr><td style="padding:6px 8px;border:1px solid #e5e7eb;"><strong>Pet</strong></td><td style="padding:6px 8px;border:1px solid #e5e7eb;">${pet} (${species})</td></tr>
          <tr><td style="padding:6px 8px;border:1px solid #e5e7eb;"><strong>Date/Time</strong></td><td style="padding:6px 8px;border:1px solid #e5e7eb;">${date} ${time} ${ampm}</td></tr>
          <tr><td style="padding:6px 8px;border:1px solid #e5e7eb;"><strong>Status</strong></td><td style="padding:6px 8px;border:1px solid #e5e7eb;">${payload['Appointment Status'] || ''}</td></tr>
        </table>
        <p style="margin-top:12px;color:#6b7280;">Updated by: ${payload['Updated by'] || ''}</p>
      </div>
    `;

    MailApp.sendEmail({
      to: list.join(','),
      subject,
      htmlBody: html,
      name: 'SPCA Outreach Team'
    });

    Logger.log(`sendAppointmentChangeEmail_(): Email sent to ${list.join(', ')}`);
  } catch (err) {
    Logger.log('sendAppointmentChangeEmail_() ERROR: ' + err.message);
  }
}