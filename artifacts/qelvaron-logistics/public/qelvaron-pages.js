document.addEventListener(
  'submit',
  async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    if (form.matches('[data-qelvaron-tracking-search]')) {
      event.preventDefault();
      event.stopImmediatePropagation();

      const status = form.parentElement?.querySelector(
        '[data-qelvaron-tracking-status]',
      );
      const reference = String(
        new FormData(form).get('trackingReference') ?? '',
      ).trim();

      if (status) {
        status.textContent = reference
          ? 'Live tracking is not connected yet. Your reference was not sent or saved. Contact your Qelvaron representative for an update.'
          : 'Enter a shipment reference to continue.';
      }
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
        ? 'Your inquiry details were copied. Nothing was sent; Qelvaron’s contact channels are still being confirmed.'
        : 'Your inquiry is ready, but could not be copied automatically. Nothing was sent; Qelvaron’s contact channels are still being confirmed.';
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
        ? 'Your inquiry details were copied. Nothing was sent.'
        : 'Nothing was sent. Qelvaron’s contact channels are still being confirmed.';
    }
  },
  true,
);
