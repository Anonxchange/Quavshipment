function showContactStatus(form, state, message) {
  const wrapper = form.closest('.w-form') || form.parentElement;
  if (!wrapper) return;

  let status = wrapper.querySelector('[data-qelvaron-contact-status]');
  if (!status) {
    status = document.createElement('p');
    status.dataset.qelvaronContactStatus = '';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    form.insertAdjacentElement('afterend', status);
  }

  status.className = 'qelvaron-contact-status';
  status.dataset.state = state;
  status.textContent = message;
}

async function submitContactInquiry(form) {
  const config = window.QELVARON_SUPABASE_CONFIG;
  if (!config?.url || !config?.publishableKey) {
    showContactStatus(
      form,
      'error',
      'The contact form is not configured here. Please email support@qelvaronlogistics.com.',
    );
    return;
  }

  const values = new FormData(form);
  const payload = {
    firstName: String(values.get('First-Name') ?? ''),
    email: String(values.get('Email-Address') ?? ''),
    company: String(values.get('Company-Name') ?? ''),
    phone: String(values.get('Phone-Number') ?? ''),
    service: String(values.get('Service-Type') ?? ''),
    message: String(values.get('Message') ?? ''),
    website: String(values.get('website') ?? ''),
  };

  const submitButton = form.querySelector(
    'input[type="submit"], button[type="submit"]',
  );
  const wasInput = submitButton instanceof HTMLInputElement;
  const originalLabel = wasInput
    ? submitButton.value
    : submitButton?.textContent ?? '';

  if (submitButton) {
    submitButton.disabled = true;
    if (wasInput) submitButton.value = 'Sending…';
    else submitButton.textContent = 'Sending…';
  }

  try {
    const endpoint = new URL(
      '/functions/v1/submit-inquiry',
      config.url,
    ).toString();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${config.publishableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const result = await response.json().catch(() => null);

    if (!response.ok || result?.ok !== true) {
      throw new Error('The inquiry was not accepted.');
    }

    form.reset();
    form.hidden = true;
    showContactStatus(
      form,
      'success',
      'Thanks — your inquiry was sent to our support team.',
    );
  } catch {
    showContactStatus(
      form,
      'error',
      'We could not send your inquiry. Your details are still here; please try again or email support@qelvaronlogistics.com.',
    );
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      if (wasInput) submitButton.value = originalLabel;
      else submitButton.textContent = originalLabel;
    }
  }
}

document.addEventListener(
  'submit',
  async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    if (form.matches('[data-qelvaron-tracking-search]')) {
      if (document.querySelector('[data-qelvaron-tracking-result]')) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      const status = form.parentElement?.querySelector(
        '[data-qelvaron-tracking-status]',
      );
      const reference = String(
        new FormData(form).get('trackingReference') ?? '',
      ).trim().toUpperCase();

      if (!reference) {
        if (status) status.textContent = 'Enter a shipment reference to continue.';
        return;
      }

      if (status) status.textContent = 'Opening secure shipment lookup…';

      const trackingUrl = new URL('/tracking/', window.location.href);
      trackingUrl.hash = new URLSearchParams({
        trackingReference: reference,
      }).toString();
      window.location.assign(trackingUrl.toString());
      return;
    }

    if (form.matches('#wf-form-Contact-Form')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      await submitContactInquiry(form);
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const values = [...new FormData(form).entries()].filter(
      ([key, value]) =>
        String(value).trim() &&
        !/turnstile|captcha|token/i.test(key),
    );
    const formName =
      form.getAttribute('data-name') ||
      form.getAttribute('aria-label') ||
      'Qelvaron inquiry';
    const details = [
      `Qelvaron Global Logistics — ${formName}`,
      ...values.map(([key, value]) => `${key}: ${value}`),
    ].join('\n');

    let copied = false;
    try {
      await navigator.clipboard.writeText(details);
      copied = true;
    } catch {
      copied = false;
    }

    const wrapper = form.closest('.w-form') || form.parentElement;
    const success = wrapper?.querySelector('.w-form-done');
    const failure = wrapper?.querySelector('.w-form-fail');

    if (failure) {
      failure.style.display = 'none';
    }

    if (success) {
      success.hidden = false;
      success.style.display = 'block';
      success.setAttribute('aria-live', 'polite');
      success.textContent = copied
        ? 'Your inquiry details were copied. Nothing was sent yet. Please paste them into an email to support@qelvaronlogistics.com.'
        : 'Your inquiry could not be copied automatically and nothing was sent. Please email your details to support@qelvaronlogistics.com.';
      form.style.display = 'none';
      success.focus();
      return;
    }

    let status = wrapper?.querySelector('[data-qelvaron-form-status]');
    if (!status && wrapper) {
      status = document.createElement('p');
      status.dataset.qelvaronFormStatus = '';
      status.setAttribute('role', 'status');
      wrapper.append(status);
    }
    if (status) {
      status.textContent = copied
        ? 'Your inquiry details were copied. Nothing was sent yet. Please paste them into an email to support@qelvaronlogistics.com.'
        : 'Nothing was sent. Please email your details to support@qelvaronlogistics.com.';
    }
  },
  true,
);
