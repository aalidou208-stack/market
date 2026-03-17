/**
 * AFRIMARKET — Seller Registration (6 steps)
 */

// ─── State ───
const regState = {
  currentStep: 1,
  phone: '',
  phonePrefix: '+225',
  fullName: '',
  email: '',
  otpVerified: false,
  sellerType: '', // 'physical' or 'digital'
  shopName: '',
  shopSlug: '',
  shopDescription: '',
  slugAvailable: false,
  docType: '',
  files: { recto: null, verso: null, selfie: null },
  momoProvider: '',
  momoNumber: '',
  momoName: '',
  deliveryMethods: [],
  pickupAddress: '',
};

let otpTimer = null;
let otpSeconds = 60;

// ─── STEP NAVIGATION ───

function goToStep(step) {
  // Hide all steps
  for (let i = 1; i <= 6; i++) {
    const el = document.getElementById(`step${i}`);
    if (el) el.classList.add('hidden');
  }
  document.getElementById('stepSuccess')?.classList.add('hidden');

  // Show target step
  const target = document.getElementById(`step${step}`);
  if (target) target.classList.remove('hidden');

  // Update stepper UI
  document.querySelectorAll('.stepper-step').forEach(s => {
    const stepNum = parseInt(s.dataset.step);
    s.classList.remove('active', 'completed');
    if (stepNum < step) s.classList.add('completed');
    if (stepNum === step) s.classList.add('active');
  });

  regState.currentStep = step;

  // Step-specific logic
  if (step === 5) {
    // Hide delivery section for digital sellers
    const deliverySection = document.getElementById('deliverySection');
    if (regState.sellerType === 'digital') {
      deliverySection.classList.add('hidden');
    } else {
      deliverySection.classList.remove('hidden');
    }
  }

  if (step === 6) {
    buildRecap();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── STEP 1: OTP ───

async function sendOTP() {
  const prefix = document.getElementById('phonePrefix').value;
  const number = document.getElementById('phoneNumber').value.replace(/\s/g, '');
  const fullName = document.getElementById('fullName').value.trim();

  if (!number || number.length < 8) {
    Toast.error('Veuillez entrer un numéro de téléphone valide');
    return;
  }
  if (!fullName) {
    Toast.error('Veuillez entrer votre nom complet');
    return;
  }

  regState.phonePrefix = prefix;
  regState.phone = number;
  regState.fullName = fullName;
  regState.email = document.getElementById('email').value.trim();

  const btn = document.getElementById('btnSendOTP');
  btn.disabled = true;
  btn.textContent = 'Envoi en cours...';

  try {
    await API.sendOTP(prefix + number);
    Toast.success('Code SMS envoyé !');

    // Show OTP section
    document.getElementById('phoneSection').classList.add('hidden');
    document.getElementById('otpSection').classList.remove('hidden');
    document.getElementById('otpPhoneDisplay').textContent = prefix + ' ' + number;

    startOTPTimer();
    focusOTPInput(0);
  } catch (err) {
    Toast.error(err.message || 'Erreur lors de l\'envoi du code');
    btn.disabled = false;
    btn.textContent = 'Envoyer le code SMS';
  }
}

function startOTPTimer() {
  otpSeconds = 60;
  const countdown = document.getElementById('countdown');
  const timerText = document.getElementById('timerText');
  const btnResend = document.getElementById('btnResend');

  timerText.classList.remove('hidden');
  btnResend.classList.add('hidden');

  clearInterval(otpTimer);
  otpTimer = setInterval(() => {
    otpSeconds--;
    countdown.textContent = otpSeconds;

    if (otpSeconds <= 0) {
      clearInterval(otpTimer);
      timerText.classList.add('hidden');
      btnResend.classList.remove('hidden');
    }
  }, 1000);
}

function focusOTPInput(index) {
  const inputs = document.querySelectorAll('.otp-input');
  if (inputs[index]) inputs[index].focus();
}

// OTP input behavior
document.addEventListener('DOMContentLoaded', () => {
  const otpInputs = document.querySelectorAll('.otp-input');

  otpInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val.slice(0, 1);

      if (val && index < 5) {
        focusOTPInput(index + 1);
      }

      if (val) {
        e.target.classList.add('filled');
      } else {
        e.target.classList.remove('filled');
      }

      // Check if all filled
      const code = Array.from(otpInputs).map(i => i.value).join('');
      if (code.length === 6) {
        verifyOTP(code);
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && index > 0) {
        focusOTPInput(index - 1);
      }
    });

    // Paste support
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const paste = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      paste.split('').forEach((char, i) => {
        if (otpInputs[i]) {
          otpInputs[i].value = char;
          otpInputs[i].classList.add('filled');
        }
      });
      if (paste.length === 6) verifyOTP(paste);
    });
  });

  // Description counter
  const descInput = document.getElementById('shopDescription');
  if (descInput) {
    descInput.addEventListener('input', () => {
      document.getElementById('descCount').textContent = descInput.value.length;
    });
  }

  // Terms checkbox
  const terms = document.getElementById('acceptTerms');
  if (terms) {
    terms.addEventListener('change', () => {
      document.getElementById('btnSubmit').disabled = !terms.checked;
    });
  }
});

async function verifyOTP(code) {
  const otpError = document.getElementById('otpError');
  otpError.classList.add('hidden');

  try {
    const phone = regState.phonePrefix + regState.phone;
    const res = await API.verifyOTP(phone, code);

    if (res.token) {
      API.setToken(res.token);
    }

    regState.otpVerified = true;
    clearInterval(otpTimer);
    Toast.success('Numéro vérifié avec succès !');
    goToStep(2);
  } catch (err) {
    otpError.textContent = err.message || 'Code incorrect. Veuillez réessayer.';
    otpError.classList.remove('hidden');

    // Clear inputs
    document.querySelectorAll('.otp-input').forEach(i => {
      i.value = '';
      i.classList.remove('filled');
    });
    focusOTPInput(0);
  }
}

// ─── STEP 2: TYPE SELECTION ───

function selectType(type) {
  regState.sellerType = type;

  document.querySelectorAll('.type-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.type === type);
  });

  document.getElementById('btnStep2Next').disabled = false;
}

// ─── STEP 3: SHOP INFO ───

function generateSlug() {
  const name = document.getElementById('shopName').value;
  const slug = slugify(name);
  document.getElementById('shopSlug').value = slug;
  if (slug) checkSlug();
}

let slugCheckTimeout;
async function checkSlug() {
  const slug = document.getElementById('shopSlug').value.trim();
  const status = document.getElementById('slugStatus');
  const hint = document.getElementById('slugHint');

  if (!slug || slug.length < 3) {
    status.textContent = '';
    regState.slugAvailable = false;
    return;
  }

  clearTimeout(slugCheckTimeout);
  status.textContent = '⏳';

  slugCheckTimeout = setTimeout(async () => {
    try {
      const res = await API.checkSlug(slug);
      if (res.available) {
        status.textContent = '✅';
        hint.textContent = 'Cette URL est disponible !';
        hint.style.color = 'var(--success)';
        regState.slugAvailable = true;
      } else {
        status.textContent = '❌';
        hint.textContent = 'Cette URL est déjà prise';
        hint.style.color = 'var(--danger)';
        regState.slugAvailable = false;
      }
    } catch (e) {
      // If API is down, allow anyway (will be validated server-side)
      status.textContent = '⚠️';
      hint.textContent = 'Vérification indisponible';
      hint.style.color = 'var(--warning)';
      regState.slugAvailable = true;
    }
  }, 500);
}

function validateStep3() {
  const name = document.getElementById('shopName').value.trim();
  const slug = document.getElementById('shopSlug').value.trim();

  if (!name) {
    Toast.error('Veuillez entrer un nom de boutique');
    return;
  }
  if (!slug || slug.length < 3) {
    Toast.error('L\'URL de la boutique doit faire au moins 3 caractères');
    return;
  }

  regState.shopName = name;
  regState.shopSlug = slug;
  regState.shopDescription = document.getElementById('shopDescription').value.trim();

  goToStep(4);
}

// ─── STEP 4: DOCUMENTS ───

function handleFileUpload(type, input) {
  const file = input.files[0];
  if (!file) return;

  // Validate size (5MB)
  if (file.size > 5 * 1024 * 1024) {
    Toast.error('Le fichier doit faire moins de 5 Mo');
    input.value = '';
    return;
  }

  // Validate format
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (type === 'selfie') {
    if (!file.type.startsWith('image/')) {
      Toast.error('Le selfie doit être une image (JPG, PNG)');
      input.value = '';
      return;
    }
  } else if (!allowed.includes(file.type)) {
    Toast.error('Format accepté : JPG, PNG, WebP ou PDF');
    input.value = '';
    return;
  }

  regState.files[type] = file;

  // Show preview
  const previewEl = document.getElementById(`preview${type.charAt(0).toUpperCase() + type.slice(1)}`);
  const uploadEl = document.getElementById(`upload${type.charAt(0).toUpperCase() + type.slice(1)}`);
  uploadEl.classList.add('has-file');

  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewEl.innerHTML = `
        <div class="file-preview">
          <img src="${e.target.result}" alt="${type}">
          <div class="file-info">
            <div class="file-name">${file.name}</div>
            <div class="file-size">${(file.size / 1024 / 1024).toFixed(2)} Mo</div>
          </div>
          <button class="file-remove" onclick="removeFile('${type}')" title="Supprimer">✕</button>
        </div>
      `;
    };
    reader.readAsDataURL(file);
  } else {
    previewEl.innerHTML = `
      <div class="file-preview">
        <div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:var(--gray-100);border-radius:4px;font-size:1.5rem;">📄</div>
        <div class="file-info">
          <div class="file-name">${file.name}</div>
          <div class="file-size">${(file.size / 1024 / 1024).toFixed(2)} Mo</div>
        </div>
        <button class="file-remove" onclick="removeFile('${type}')" title="Supprimer">✕</button>
      </div>
    `;
  }
}

function removeFile(type) {
  regState.files[type] = null;
  const capitalType = type.charAt(0).toUpperCase() + type.slice(1);
  document.getElementById(`preview${capitalType}`).innerHTML = '';
  document.getElementById(`upload${capitalType}`).classList.remove('has-file');
  document.getElementById(`input${capitalType}`).value = '';
}

function validateStep4() {
  const docType = document.getElementById('docType').value;
  if (!docType) {
    Toast.error('Veuillez choisir le type de document');
    return;
  }
  if (!regState.files.recto) {
    Toast.error('Veuillez télécharger le recto du document');
    return;
  }
  if (!regState.files.verso) {
    Toast.error('Veuillez télécharger le verso du document');
    return;
  }
  if (!regState.files.selfie) {
    Toast.error('Veuillez télécharger le selfie avec le document');
    return;
  }

  regState.docType = docType;
  goToStep(5);
}

// ─── STEP 5: PAYMENT + DELIVERY ───

function validateStep5() {
  const provider = document.getElementById('momoProvider').value;
  const number = document.getElementById('momoNumber').value.trim();
  const name = document.getElementById('momoName').value.trim();

  if (!provider) {
    Toast.error('Veuillez choisir un opérateur Mobile Money');
    return;
  }
  if (!number || number.length < 8) {
    Toast.error('Veuillez entrer un numéro Mobile Money valide');
    return;
  }
  if (!name) {
    Toast.error('Veuillez entrer le nom du titulaire');
    return;
  }

  regState.momoProvider = provider;
  regState.momoNumber = number;
  regState.momoName = name;

  // Check delivery methods for physical products
  if (regState.sellerType === 'physical') {
    const checked = document.querySelectorAll('input[name="delivery"]:checked');
    if (checked.length === 0) {
      Toast.error('Veuillez sélectionner au moins une méthode de livraison');
      return;
    }
    regState.deliveryMethods = Array.from(checked).map(c => c.value);
    regState.pickupAddress = document.getElementById('pickupAddress').value.trim();
  }

  goToStep(6);
}

// ─── STEP 6: RECAP ───

function buildRecap() {
  const providerNames = {
    orange_money: 'Orange Money',
    wave: 'Wave',
    mtn_momo: 'MTN Mobile Money',
    moov_money: 'Moov Money',
  };
  const deliveryNames = {
    hand_delivery: 'Remise en main propre',
    local_delivery: 'Livraison locale',
    national_shipping: 'Expédition nationale',
    partner_delivery: 'Partenaire Afrimarket',
  };

  let html = `
    <div class="recap-section">
      <h4>👤 Compte</h4>
      <div class="recap-row"><span class="label">Nom</span><span class="value">${regState.fullName}</span></div>
      <div class="recap-row"><span class="label">Téléphone</span><span class="value">${regState.phonePrefix} ${regState.phone} ✅</span></div>
      ${regState.email ? `<div class="recap-row"><span class="label">Email</span><span class="value">${regState.email}</span></div>` : ''}
    </div>

    <div class="recap-section">
      <h4>🏪 Boutique</h4>
      <div class="recap-row"><span class="label">Type</span><span class="value">${regState.sellerType === 'physical' ? '📦 Produits physiques' : '💻 Produits digitaux'}</span></div>
      <div class="recap-row"><span class="label">Nom</span><span class="value">${regState.shopName}</span></div>
      <div class="recap-row"><span class="label">URL</span><span class="value">afrimarket.com/${regState.shopSlug}</span></div>
      ${regState.shopDescription ? `<div class="recap-row"><span class="label">Description</span><span class="value">${regState.shopDescription}</span></div>` : ''}
    </div>

    <div class="recap-section">
      <h4>🪪 Identité</h4>
      <div class="recap-row"><span class="label">Document</span><span class="value">${regState.docType === 'cni' ? 'CNI' : 'Passeport'}</span></div>
      <div class="recap-row"><span class="label">Recto</span><span class="value">${regState.files.recto?.name || '—'} ✅</span></div>
      <div class="recap-row"><span class="label">Verso</span><span class="value">${regState.files.verso?.name || '—'} ✅</span></div>
      <div class="recap-row"><span class="label">Selfie</span><span class="value">${regState.files.selfie?.name || '—'} ✅</span></div>
    </div>

    <div class="recap-section">
      <h4>💰 Paiement</h4>
      <div class="recap-row"><span class="label">Opérateur</span><span class="value">${providerNames[regState.momoProvider] || regState.momoProvider}</span></div>
      <div class="recap-row"><span class="label">Numéro</span><span class="value">${regState.momoNumber}</span></div>
      <div class="recap-row"><span class="label">Titulaire</span><span class="value">${regState.momoName}</span></div>
    </div>
  `;

  if (regState.sellerType === 'physical' && regState.deliveryMethods.length > 0) {
    html += `
      <div class="recap-section">
        <h4>🚚 Livraison</h4>
        ${regState.deliveryMethods.map(m => `
          <div class="recap-row"><span class="label">✓</span><span class="value">${deliveryNames[m] || m}</span></div>
        `).join('')}
        ${regState.pickupAddress ? `<div class="recap-row"><span class="label">Adresse</span><span class="value">${regState.pickupAddress}</span></div>` : ''}
      </div>
    `;
  }

  document.getElementById('recapContent').innerHTML = html;
}

// ─── SUBMIT ───

async function submitRegistration() {
  const btn = document.getElementById('btnSubmit');
  btn.disabled = true;
  btn.textContent = 'Envoi en cours...';

  try {
    // Upload documents first
    for (const docField of ['recto', 'verso', 'selfie']) {
      if (regState.files[docField]) {
        const formData = new FormData();
        formData.append('document', regState.files[docField]);
        formData.append('type', docField);
        formData.append('doc_type', regState.docType);
        await API.uploadDocument(formData);
      }
    }

    // Submit registration
    const data = {
      full_name: regState.fullName,
      phone: regState.phonePrefix + regState.phone,
      email: regState.email || null,
      seller_type: regState.sellerType,
      shop_name: regState.shopName,
      shop_slug: regState.shopSlug,
      shop_description: regState.shopDescription,
      doc_type: regState.docType,
      momo_provider: regState.momoProvider,
      momo_number: regState.momoNumber,
      momo_name: regState.momoName,
      delivery_methods: regState.deliveryMethods,
      pickup_address: regState.pickupAddress,
    };

    const res = await API.registerSeller(data);

    // Show success
    for (let i = 1; i <= 6; i++) {
      document.getElementById(`step${i}`).classList.add('hidden');
    }
    document.getElementById('stepSuccess').classList.remove('hidden');
    document.getElementById('successPhone').textContent = regState.phonePrefix + ' ' + regState.phone;
    document.getElementById('applicationId').textContent = res.application_id || 'AM-' + Date.now().toString(36).toUpperCase();

    // Mark all steps completed
    document.querySelectorAll('.stepper-step').forEach(s => {
      s.classList.remove('active');
      s.classList.add('completed');
    });

    Toast.success('Demande envoyée avec succès !');
  } catch (err) {
    Toast.error(err.message || 'Erreur lors de l\'envoi. Veuillez réessayer.');
    btn.disabled = false;
    btn.textContent = 'Soumettre ma demande';
  }
}

// ─── DRAG & DROP ───
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.file-upload').forEach(zone => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('dragover');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const input = zone.parentElement.querySelector('input[type="file"]');
      if (input && e.dataTransfer.files.length) {
        input.files = e.dataTransfer.files;
        input.dispatchEvent(new Event('change'));
      }
    });
  });
});