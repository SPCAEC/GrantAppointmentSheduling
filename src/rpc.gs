<script>
(function () {
  const { $, $$, sectionTitle } = window.SPCA || {};
  const SCHEDULER = () => (typeof getSchedulerName === 'function' ? getSchedulerName() : 'Staff');

  window.renderModifyFlow = function renderModifyFlow(container) {
    if (typeof showWhoAreYouScreen === 'function' && !SCHEDULER()) {
        return showWhoAreYouScreen(container, () => renderModifyFlow(container));
    }   
    
    if(sectionTitle) sectionTitle.textContent = 'Modify / Reschedule';

    const TX = {
      mode: null, 
      apptId: null,
      originalAppt: null, 
      owner: null, 
      pet: null,   
      newType: null,
      newSlot: null,
      isRogue: false,
      rogueData: {},
      originalOwnerState: null
    };

    const stepHistory = [];

    function nextStep(currentId, nextId) {
      container.querySelector('#'+currentId).classList.add('hidden');
      container.querySelector('#'+nextId).classList.remove('hidden');
      window.scrollTo({top:0, behavior:'smooth'});

      stepHistory.push(currentId);

      window.SPCA.setBackHandler(() => {
        const prevId = stepHistory.pop();
        container.querySelector('#'+nextId).classList.add('hidden');
        container.querySelector('#'+prevId).classList.remove('hidden');
        
        if (stepHistory.length === 0) {
          window.SPCA.setBackHandler(null);
        }
      });
    }

    container.innerHTML = `
      <div id="step-search" class="schedule-step">
        <h2>Find Appointment</h2>
        <div class="grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem;">
            <div class="field">
              <label>Date</label>
              <div style="display:flex; align-items:center; gap:8px;">
                <input id="mDate" type="text" placeholder="MM/DD/YYYY" maxlength="10">
                <div style="position:relative; width:32px; height:32px; flex-shrink:0;">
                   <input id="mDatePicker" type="date" 
                          style="position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%; z-index:2;">
                   <button class="btn secondary" style="width:100%; height:100%; padding:0; display:flex; align-items:center; justify-content:center;">📅</button>
                </div>
              </div>
            </div>
            <div class="field"><label>Client Name</label><input id="mClient" type="text" placeholder="Last Name"></div>
            <div class="field"><label>Pet Name</label><input id="mPet" type="text"></div>
        </div>
        <div class="actions">
            <button id="mSearchBtn" class="btn">Search</button>
            <button id="mClearBtn" class="btn secondary">Clear</button>
        </div>
        <div id="mResults" style="margin-top:1rem;"></div>
      </div>

      <div id="step-mode" class="schedule-step hidden">
        <h2>What would you like to do?</h2>
        <div class="card" style="padding:2rem; text-align:center; background:#f0f9ff; border:1px solid #bae6fd;">
           <p style="font-size:1.1rem; margin-bottom:2rem;">
             Selected: <strong id="selApptDesc"></strong>
           </p>
           <div class="actions" style="flex-direction:column; gap:1rem;">
             <button id="btnReschedule" class="btn" style="height:50px; font-size:1.05rem;">Yes - Reschedule (Day/Time/Type)</button>
             <button id="btnUpdateOnly" class="btn secondary" style="height:50px; font-size:1.05rem;">No - Update Info Only</button>
           </div>
        </div>
      </div>

      <div id="step-type" class="schedule-step hidden">
        <h2>New Appointment Type</h2>
        <div class="option-buttons">
          <button class="btn" data-type="Surgery">Surgery</button>
          <button class="btn" data-type="Wellness">Wellness</button>
        </div>
      </div>

      <div id="step-slots" class="schedule-step hidden">
        <h2>Select New Slot</h2>
        <div id="slotGrid" class="card-grid"></div>
        <div class="actions">
          <button id="showMoreBtn" class="btn secondary">Show More</button>
          <button id="rogueBtn" class="btn tertiary" style="border:2px dashed #dc2626; color:#dc2626;">Go Rogue (Create Exception)</button>
        </div>
      </div>

      <div id="step-rogue" class="schedule-step hidden">
        <div style="background:#fff1f2; padding:1rem; border-radius:8px; border:1px solid #dc2626; margin-bottom:1.5rem;">
          <h3 style="color:#b91c1c; margin-top:0;">Exception Details</h3>
          <div class="field"><label>Date</label><input id="rDate" type="text" placeholder="MM/DD/YYYY"></div>
          <div class="grid" style="grid-template-columns:1fr 1fr; gap:1rem; display:grid;">
            <div class="field"><label>Time</label><input id="rTime" type="text" placeholder="09:00"></div>
            <div class="field"><label>AM/PM</label><select id="rAmPm"><option>AM</option><option>PM</option></select></div>
          </div>
        </div>
        <div class="actions"><button id="rNext" class="btn">Next</button></div>
      </div>

      <div id="step-owner" class="schedule-step hidden">
        <h2>Update Owner Info</h2>
        <input type="hidden" id="ownerId">
        <div class="grid" style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
          <div class="field"><label>First Name</label><input id="oFirst"></div>
          <div class="field"><label>Last Name</label><input id="oLast"></div>
        </div>
        <div class="field"><label>Phone</label><input id="oPhone"></div>
        <div class="field"><label>Email</label><input id="oEmail"></div>
        <div class="field"><label>Address</label><input id="oAddress"></div>
        <div class="grid" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.5rem;">
          <div class="field"><label>City</label><input id="oCity"></div>
          <div class="field"><label>State</label><input id="oState"></div>
          <div class="field"><label>Zip</label><input id="oZip"></div>
        </div>
        <div class="actions">
          <button id="btnSaveOwner" class="btn">Save & Review Pet</button>
        </div>
      </div>

      <div id="step-pet" class="schedule-step hidden">
        <h2>Update Pet Info</h2>
        <input type="hidden" id="petId">
        <div class="field"><label>Pet Name</label><input id="pName"></div>
        <div class="field"><label>Species</label>
          <select id="pSpecies"><option>Canine</option><option>Feline</option><option>Other</option></select>
        </div>
        <div class="grid" style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
          <div class="field"><label>Breed 1</label><input id="pBreed1"></div>
          <div class="field"><label>Breed 2</label><input id="pBreed2"></div>
          <div class="field"><label>Color</label><input id="pColor"></div>
          <div class="field"><label>Pattern</label><input id="pPattern"></div>
          <div class="field"><label>Sex</label><select id="pSex"><option>Male</option><option>Female</option><option>Unknown</option></select></div>
          <div class="field"><label>Spayed/Neutered</label><select id="pFixed"><option>Spayed</option><option>Neutered</option><option>No</option><option>Unknown</option></select></div>
        </div>
        <div class="grid" style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
          <div class="field"><label>Age</label><input id="pAge"></div>
          <div class="field"><label>Weight</label><input id="pWeight" type="number"></div>
        </div>
        <div class="actions">
          <button id="btnSavePet" class="btn">Save & Review Appointment</button>
        </div>
      </div>

      <div id="step-details" class="schedule-step hidden">
        <h2>Appointment Details</h2>
        <div style="background:#f0f9ff; padding:1rem; border-radius:8px; margin-bottom:1rem; border:1px solid #bae6fd;">
          <div id="summaryText"></div>
        </div>
        
        <div class="field"><label>Vaccines Needed</label><div id="vaccines" class="option-list"></div></div>
        <div class="field"><label>Additional Services</label><div id="services" class="option-list"></div></div>
        
        <div class="field">
          <label>Previous Vet Records?</label>
          <div class="option-buttons-left">
            <label><input type="radio" name="hasRec" value="Yes"> Yes</label>
            <label><input type="radio" name="hasRec" value="No"> No</label>
          </div>
        </div>
        
        <div class="field"><label>Vet Office</label><input id="aVet"></div>
        <div class="field"><label>Allergies</label><input id="aAllergy"></div>
        <div class="field"><label>Notes</label><textarea id="aNotes"></textarea></div>
        
        <div class="actions">
          <button id="btnFinalize" class="btn">Finish</button>
        </div>
      </div>

      <div id="step-loading" class="schedule-step hidden"><div class="spinner"></div></div>
    `;

    window.SPCA.setBackHandler(null);
    setupSearchLogic(container, TX, nextStep);
    setupRescheduleFlow(container, TX, nextStep);
    setupForms(container, TX, nextStep);
  };

  function setupSearchLogic(container, TX, nextStep) {
    const mDate = container.querySelector('#mDate');
    const mDatePicker = container.querySelector('#mDatePicker');
    const searchBtn = container.querySelector('#mSearchBtn');
    const results = container.querySelector('#mResults');

    mDatePicker.addEventListener('change', () => {
      if (mDatePicker.value) {
        const [y, m, d] = mDatePicker.value.split('-');
        mDate.value = `${m}/${d}/${y}`;
      }
    });
    mDate.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, ''); 
      if (v.length >= 5) v = `${v.slice(0,2)}/${v.slice(2,4)}/${v.slice(4,8)}`;
      else if (v.length >= 3) v = `${v.slice(0,2)}/${v.slice(2)}`;
      e.target.value = v;
    });
    [mDate, container.querySelector('#mClient'), container.querySelector('#mPet')].forEach(input => {
      input.addEventListener('keyup', (e) => { if (e.key === 'Enter') searchBtn.click(); });
    });

    searchBtn.addEventListener('click', () => {
      results.innerHTML = `<div class="spinner"></div>`;
      google.script.run.withSuccessHandler(res => {
        if (!res || !res.ok) { results.innerHTML = '<p>Error.</p>'; return; }
        renderResults(res.rows || []);
      }).apiSearchAppointments({
        date: mDate.value.trim(),
        client: container.querySelector('#mClient').value.trim(),
        pet: container.querySelector('#mPet').value.trim()
      });
    });

    container.querySelector('#mClearBtn').addEventListener('click', () => {
       mDate.value = ''; mDatePicker.value = ''; 
       container.querySelector('#mClient').value = '';
       container.querySelector('#mPet').value = '';
       results.innerHTML = '';
    });

    function renderResults(rows) {
      results.innerHTML = '';
      if(!rows.length) { results.innerHTML = '<p>No matches.</p>'; return; }
      
      const grid = document.createElement('div');
      grid.className = 'card-grid';
      results.appendChild(grid);

      rows.forEach(r => {
        const disabled = !r.editable;
        const card = document.createElement('div');
        card.className = 'card';
        if(disabled) card.style.opacity = 0.6;
        card.innerHTML = `
          <div style="font-weight:600;">${r.firstName} ${r.lastName} — ${r.petName}</div>
          <div>${r.date} ${r.time}</div>
          <div>Status: ${r.status}</div>
          ${disabled ? '<small style="color:#991b1b;">Past Date</small>' : ''}
        `;
        if(!disabled) {
          card.style.cursor = 'pointer';
          card.onclick = () => selectAppointment(r);
        }
        grid.appendChild(card);
      });
    }

    function selectAppointment(row) {
      results.innerHTML = '<div class="spinner"></div>';
      google.script.run.withSuccessHandler(res => {
         if(!res || !res.ok) { 
             alert('Error fetching data. Check logs.'); 
             results.innerHTML = ''; 
             return; 
         }
         
         TX.apptId = row.id;
         TX.originalAppt = res.appointment; 
         TX.owner = res.owner;              
         TX.pet = res.pet || { name: 'Unknown', species: 'Other' }; 
         
         container.querySelector('#selApptDesc').textContent = 
            `${TX.owner.firstName} ${TX.owner.lastName} — ${TX.pet.name} (${row.date} @ ${row.time})`;
         
         nextStep('step-search', 'step-mode');
      }).apiGetModifyContext(row.id);
    }
  }

  function setupRescheduleFlow(container, TX, nextStep) {
    container.querySelector('#btnReschedule').onclick = () => {
       TX.mode = 'RESCHEDULE';
       nextStep('step-mode', 'step-type');
    };
    container.querySelector('#btnUpdateOnly').onclick = () => {
       TX.mode = 'UPDATE';
       populateOwnerForm(container, TX);
       nextStep('step-mode', 'step-owner');
    };

    container.querySelectorAll('#step-type button').forEach(b => {
      b.addEventListener('click', () => {
        TX.newType = b.dataset.type;
        nextStep('step-type', 'step-slots');
        loadSlots();
      });
    });

    let slotsCount = 6;
    function loadSlots() {
      const grid = container.querySelector('#slotGrid');
      grid.innerHTML = '<div class="spinner"></div>';
      google.script.run.withSuccessHandler(res => {
        grid.innerHTML = '';
        if(!res.ok || !res.slots.length) { grid.innerHTML = '<p>No slots available.</p>'; return; }
        res.slots.forEach(s => {
          const card = document.createElement('div');
          card.className = 'card';
          card.innerHTML = `
            <div style="font-weight:700;">${TX.newType}</div>
            <div>${s.day} ${s.date}</div>
            <div>${s.time}</div>
            <div style="font-size:0.8rem;">Grant: ${s.grant}</div>
          `;
          card.onclick = () => {
             TX.newSlot = s;
             TX.isRogue = false;
             populateOwnerForm(container, TX);
             nextStep('step-slots', 'step-owner');
          };
          grid.appendChild(card);
        });
      }).apiGetAvailableSlots(TX.newType, slotsCount);
    }
    
    container.querySelector('#showMoreBtn').onclick = () => { slotsCount += 6; loadSlots(); };
    
    container.querySelector('#rogueBtn').onclick = () => {
       TX.isRogue = true;
       nextStep('step-slots', 'step-rogue');
    };
    
    const rDate = container.querySelector('#rDate');
    const rTime = container.querySelector('#rTime');
    rDate.addEventListener('input', (e) => {
        let v = e.target.value.replace(/\D/g, '');
        if (v.length >= 5) v = `${v.slice(0,2)}/${v.slice(2,4)}/${v.slice(4,8)}`;
        else if (v.length >= 3) v = `${v.slice(0,2)}/${v.slice(2)}`;
        e.target.value = v;
    });
    rTime.addEventListener('blur', (e) => {
        let v = e.target.value.replace(/\D/g, ''); 
        if (v.length > 0) {
            if (v.length === 1) v = `0${v}:00`;       
            else if (v.length === 2) v = `${v}:00`;   
            else if (v.length === 3) v = `0${v.slice(0,1)}:${v.slice(1)}`; 
            else if (v.length === 4) v = `${v.slice(0,2)}:${v.slice(2)}`; 
            e.target.value = v;
        }
    });

    container.querySelector('#rNext').onclick = () => {
       const d = container.querySelector('#rDate').value;
       const t = container.querySelector('#rTime').value;
       if(!d || !t) { alert('Date/Time required'); return; }
       
       TX.rogueData = { date: d, time: t, ampm: container.querySelector('#rAmPm').value };
       populateOwnerForm(container, TX);
       nextStep('step-rogue', 'step-owner');
    };
  }

  function setupForms(container, TX, nextStep) {
    container.querySelector('#btnSaveOwner').onclick = () => {
        const payload = getOwnerFormData(container);
        const required = ['First Name', 'Last Name', 'Phone', 'Email', 'Street Address', 'City', 'State', 'Zip Code'];
        if(required.some(k => !payload[k])) { alert('Please fill all owner fields.'); return; }

        const currentJson = JSON.stringify(payload);
        if (currentJson === TX.originalOwnerState) {
            console.log('Skipping owner save (no changes)');
            populatePetForm(container, TX);
            nextStep('step-owner', 'step-pet');
        } else {
            const btn = container.querySelector('#btnSaveOwner');
            btn.textContent = 'Saving...';
            btn.disabled = true;
            google.script.run.withSuccessHandler(id => {
               btn.textContent = 'Save & Review Pet';
               btn.disabled = false;
               TX.owner = { ...payload, ownerId: id }; 
               populatePetForm(container, TX);
               nextStep('step-owner', 'step-pet');
            }).apiUpsertOwner(payload, TX.scheduler); 
        }
    };

    container.querySelector('#btnSavePet').onclick = () => {
        const payload = getPetFormData(container);
        const btn = container.querySelector('#btnSavePet');
        btn.textContent = 'Saving...';
        btn.disabled = true;
        
        google.script.run.withSuccessHandler(id => {
           btn.textContent = 'Save & Review Appointment';
           btn.disabled = false;
           TX.pet = { ...payload, petId: id };
           populateApptDetails(container, TX);
           nextStep('step-pet', 'step-details');
        }).apiUpsertPet(payload, TX.scheduler); 
    };

    container.querySelector('#btnFinalize').onclick = () => {
        showTransportModal(container, TX);
    };
  }

  function populateOwnerForm(container, TX) {
    const d = TX.owner || {};
    const set = (id, val) => container.querySelector('#'+id).value = val || '';
    
    set('ownerId', d.ownerId);
    set('oFirst', d.firstName);
    set('oLast', d.lastName);
    set('oPhone', d.phone);
    set('oEmail', d.email);
    set('oAddress', d.address);
    set('oCity', d.city);
    set('oState', d.state);
    set('oZip', d.zip);

    TX.originalOwnerState = JSON.stringify(getOwnerFormData(container));
  }

  function getOwnerFormData(container) {
    return {
      'Owner ID': container.querySelector('#ownerId').value,
      'First Name': container.querySelector('#oFirst').value.trim(),
      'Last Name': container.querySelector('#oLast').value.trim(),
      'Phone': container.querySelector('#oPhone').value.trim(),
      'Email': container.querySelector('#oEmail').value.trim(),
      'Street Address': container.querySelector('#oAddress').value.trim(),
      'City': container.querySelector('#oCity').value.trim(),
      'State': container.querySelector('#oState').value.trim(),
      'Zip Code': container.querySelector('#oZip').value.trim()
    };
  }

  function populatePetForm(container, TX) {
    const p = TX.pet || {};
    const set = (id, val) => container.querySelector('#'+id).value = val || '';
    set('petId', p.petId);
    set('pName', p.name);
    set('pSpecies', p.species);
    set('pBreed1', p.breed);
    set('pBreed2', p.breed2);
    set('pColor', p.color);
    set('pPattern', p.pattern);
    set('pSex', p.sex);
    set('pFixed', p.fixed);
    set('pAge', p.age);
    set('pWeight', p.weight);
  }

  function getPetFormData(container) {
    return {
      'Pet ID': container.querySelector('#petId').value,
      'Owner ID': container.querySelector('#ownerId').value,
      'Pet Name': container.querySelector('#pName').value,
      'Species': container.querySelector('#pSpecies').value,
      'Primary Breed': container.querySelector('#pBreed1').value,
      'Secondary Breed': container.querySelector('#pBreed2').value,
      'Color': container.querySelector('#pColor').value,
      'Color Pattern': container.querySelector('#pPattern').value,
      'Sex': container.querySelector('#pSex').value,
      'Altered': container.querySelector('#pFixed').value,
      'Age': container.querySelector('#pAge').value,
      'Weight': container.querySelector('#pWeight').value
    };
  }

  function populateApptDetails(container, TX) {
    let type = (TX.mode === 'RESCHEDULE') ? TX.newType : TX.originalAppt['Appointment Type'];
    let timeInfo = '';
    if (TX.mode === 'RESCHEDULE') {
       timeInfo = TX.isRogue 
         ? `${TX.rogueData.date} @ ${TX.rogueData.time}` 
         : `${TX.newSlot.day} ${TX.newSlot.date} @ ${TX.newSlot.time}`;
    } else {
       timeInfo = `${TX.originalAppt['Date']} @ ${TX.originalAppt['Time']} ${TX.originalAppt['AM or PM'] || ''}`;
    }
    
    container.querySelector('#summaryText').innerHTML = `
       <div style="font-size:1.1rem; font-weight:700; margin-bottom:4px;">${type}</div>
       <div>${timeInfo}</div>
       <div style="opacity:0.8;">${TX.owner.firstName} ${TX.owner.lastName} — ${TX.pet.name}</div>
    `;

    const raw = TX.originalAppt;
    const csvToArray = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
    const chosenVac = csvToArray(raw['Vaccines Needed']);
    const chosenSvc = csvToArray(raw['Additional Services']);

    google.script.run.withSuccessHandler(res => {
       const lists = { canine: res.canine, feline: res.feline };
       const species = (TX.pet.species === 'Canine') ? 'Canine' : 'Feline'; 
       const opts = (species === 'Canine') ? lists.canine : lists.feline;
       
       container.querySelector('#vaccines').innerHTML = opts.map(v => 
         `<label class="radio-option"><input type="checkbox" name="vaccine" value="${v}" ${chosenVac.includes(v)?'checked':''}> ${v}</label>`
       ).join('');
    }).apiGetVaccineLists();

    google.script.run.withSuccessHandler(res => {
       container.querySelector('#services').innerHTML = res.services.map(s => 
         `<label class="radio-option"><input type="checkbox" name="service" value="${s}" ${chosenSvc.includes(s)?'checked':''}> ${s}</label>`
       ).join('');
    }).apiGetAdditionalServices();

    container.querySelector('#aVet').value = raw['Vet Office Name'] || '';
    container.querySelector('#aAllergy').value = raw['Allergies or Sensitivities'] || '';
    container.querySelector('#aNotes').value = raw['Notes'] || '';
    
    const recVal = raw['Previous Vet Records'] || 'No';
    const recRadio = container.querySelector(`input[name="hasRec"][value="${recVal}"]`);
    if(recRadio) recRadio.checked = true;
  }

  function getApptPayload(container, TX) {
     return {
        'First Name': TX.owner.firstName,
        'Last Name': TX.owner.lastName,
        'Phone Number': TX.owner.phone,
        'Email': TX.owner.email,
        'Street Address': TX.owner.address,
        'City': TX.owner.city,
        'State': TX.owner.state,
        'Zip Code': TX.owner.zip,
        
        'Pet Name': TX.pet.name,
        'Species': TX.pet.species,
        'Breed One': TX.pet.breed,
        'Breed Two': TX.pet.breed2,
        'Color': TX.pet.color,
        'Color Pattern': TX.pet.pattern,
        'Sex': TX.pet.sex,
        'Spayed or Neutered': TX.pet.fixed,
        'Age': TX.pet.age,
        'Weight': TX.pet.weight,

        'Notes': container.querySelector('#aNotes').value,
        'Vet Office Name': container.querySelector('#aVet').value,
        'Allergies or Sensitivities': container.querySelector('#aAllergy').value,
        'Vaccines Needed': [...container.querySelectorAll('input[name="vaccine"]:checked')].map(el => el.value).join(', '),
        'Additional Services': [...container.querySelectorAll('input[name="service"]:checked')].map(el => el.value).join(', '),
        'Previous Vet Records': container.querySelector('input[name="hasRec"]:checked')?.value || 'No'
     };
  }

  function showTransportModal(container, TX) {
    document.querySelectorAll('.modal').forEach(m => m.remove());
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    const hasVetRecords = container.querySelector('input[name="hasRec"]:checked')?.value === 'Yes';
    const prevTrans = TX.originalAppt['Transportation Needed'] || 'No';
    
    modal.innerHTML = `
      <div class="modal-content">
        <p style="margin-bottom:0.5rem;">Transportation assistance needed?</p>
        <p style="margin-top:-0.5rem; margin-bottom:1.25rem; color:#4b5563; font-size:0.9rem; background:#f3f4f6; display:inline-block; padding:0.25rem 0.75rem; border-radius:8px;">
           Currently: <strong>${prevTrans}</strong>
        </p>
        <div class="actions transport-actions">
          <button class="btn secondary transportBtn" data-val="Yes">Yes</button>
          <button class="btn secondary transportBtn" data-val="No">No</button>
        </div>
        
        ${hasVetRecords ? `
          <hr class="divider">
          <p>Previous Vet Records Action:</p>
          <div class="actions record-actions">
             <button id="btnAlready" class="btn secondary recordBtn">Already Provided</button>
             <button id="btnUpload" class="btn secondary recordBtn">Upload</button>
             <button id="btnRequest" class="btn secondary recordBtn">Request</button>
             <button id="btnRemind" class="btn secondary recordBtn">Remind</button>
             <input type="file" id="uploadInput" hidden multiple>
          </div>
          <div id="toast" style="margin-top:10px;"></div>
        ` : ``}
        
        <hr class="divider">
        <div class="actions">
           <button id="btnFinalSubmit" class="btn" disabled>Submit Changes</button>
           <button id="btnCancelModal" class="btn secondary">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    let chosenTransport = null;
    
    modal.querySelectorAll('.transportBtn').forEach(b => {
       b.onclick = () => {
          modal.querySelectorAll('.transportBtn').forEach(x => { x.classList.remove('selected'); x.classList.add('secondary'); });
          b.classList.remove('secondary'); b.classList.add('selected');
          chosenTransport = b.dataset.val;
          modal.querySelector('#btnFinalSubmit').disabled = false;
       };
    });

    const toast = (msg) => modal.querySelector('#toast').innerHTML = `<small style="color:var(--success); font-weight:bold;">${msg}</small>`;

    if(hasVetRecords) {
        const highlight = (id) => {
            modal.querySelectorAll('.recordBtn').forEach(b => {
               if(b.id === id) { b.classList.add('selected'); b.classList.remove('secondary'); }
               else { b.classList.remove('selected'); b.classList.add('secondary'); }
            });
        };

        modal.querySelector('#btnAlready').onclick = () => { highlight('btnAlready'); toast('Marked as provided.'); };
        
        modal.querySelector('#btnRequest').onclick = () => {
           highlight('btnRequest');
           google.script.run.apiSendVetRecordsRequest(TX.owner.email, '', TX.owner.firstName, TX.pet.name);
           toast('Request sent.');
        };
        
        modal.querySelector('#btnRemind').onclick = () => {
           highlight('btnRemind');
           const card = TX.mode==='RESCHEDULE' ? (TX.isRogue ? TX.rogueData.date : TX.newSlot.date) : TX.originalAppt.Date;
           google.script.run.apiSendVetRecordReminder(TX.scheduler, TX.pet.name, card);
           toast('Reminder set.');
        };

        modal.querySelector('#btnUpload').onclick = () => {
           highlight('btnUpload');
           modal.querySelector('#uploadInput').click();
        };
        modal.querySelector('#uploadInput').onchange = () => {
           toast('Files selected.');
        };
    }

    modal.querySelector('#btnCancelModal').onclick = () => modal.remove();
    
    modal.querySelector('#btnFinalSubmit').onclick = () => {
       const btn = modal.querySelector('#btnFinalSubmit');
       btn.textContent = 'Processing...';
       btn.disabled = true;
       
       const payload = getApptPayload(container, TX);
       payload['Transportation Needed'] = chosenTransport;

       if(TX.mode === 'UPDATE') {
          google.script.run.withSuccessHandler(res => {
             modal.remove();
             if(!res.ok) { alert('Error: ' + res.error); return; }
             showSuccess(container, 'Appointment Updated');
          }).apiUpdateAppointment(TX.apptId, payload, TX.scheduler, chosenTransport);
       } else {
          const newSlotId = TX.isRogue ? null : TX.newSlot.id;
          const newType = TX.newType; 
          
          if(TX.isRogue) {
             payload['Date'] = TX.rogueData.date;
             payload['Time'] = TX.rogueData.time;
             payload['AM or PM'] = TX.rogueData.ampm;
          } else {
             payload['Date'] = TX.newSlot.date;
             payload['Time'] = TX.newSlot.time;
          }

          google.script.run.withSuccessHandler(res => {
             modal.remove();
             if(!res.ok) { alert('Error: ' + res.error); return; }
             showSuccess(container, 'Appointment Rescheduled');
          }).apiRescheduleAppointment(TX.apptId, newSlotId, newType, payload, TX.scheduler, TX.isRogue, TX.rogueData);
       }
    };
  }

  function showSuccess(container, title) {
     container.querySelector('#step-details').classList.add('hidden');
     container.innerHTML = `
        <div style="text-align:center; padding:3rem;">
           <div style="font-size:4rem;">✅</div>
           <h2>${title}</h2>
           <div class="actions" style="justify-content:center; margin-top:2rem;">
              <button class="btn" onclick="window.renderModifyFlow(document.querySelector('#view-modify'))">Return to Search</button>
           </div>
        </div>
     `;
  }

})();
</script>