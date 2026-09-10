/**
 * Contact Picker API helpers — on-demand pick from the device address book.
 * Supported mainly on Android Chrome (secure context + user gesture).
 * Not continuous sync: browsers do not allow background contact access.
 */

export type ContactProperty = 'name' | 'tel' | 'email' | 'address' | 'icon';

export interface PickedContact {
  name: string;
  /** First telephone number, if any. */
  phone: string;
}

type ContactInfo = {
  name?: string[];
  tel?: string[];
  email?: string[];
  address?: unknown[];
  icon?: Blob[];
};

type ContactsManagerLike = {
  getProperties(): Promise<string[]>;
  select(
    properties: string[],
    options?: { multiple?: boolean },
  ): Promise<ContactInfo[]>;
};

declare global {
  interface Navigator {
    contacts?: ContactsManagerLike;
  }
  interface Window {
    ContactsManager?: unknown;
  }
}

export function isContactPickerSupported(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      'contacts' in navigator &&
      'ContactsManager' in window &&
      typeof navigator.contacts?.select === 'function'
    );
  } catch {
    return false;
  }
}

function firstString(arr?: string[]): string {
  if (!arr || arr.length === 0) return '';
  const v = arr[0];
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Open the system contact picker (must be called from a top-level user gesture).
 * Returns [] if the user cancels or nothing usable is selected.
 * Throws only for unexpected failures (caller may ignore).
 */
export async function pickContacts(
  options: { multiple?: boolean } = { multiple: true },
): Promise<PickedContact[]> {
  if (!isContactPickerSupported() || !navigator.contacts) {
    return [];
  }

  const wanted: ContactProperty[] = ['name', 'tel'];
  let props = wanted as string[];
  try {
    const available = await navigator.contacts.getProperties();
    props = wanted.filter((p) => available.includes(p));
  } catch {
    /* older implementations may lack getProperties — request name+tel */
  }
  if (props.length === 0) return [];

  let raw: ContactInfo[];
  try {
    raw = await navigator.contacts.select(props, {
      multiple: options.multiple !== false,
    });
  } catch (err) {
    // User cancel / abort is typically a DOMException — treat as empty
    if (
      err &&
      typeof err === 'object' &&
      'name' in err &&
      ((err as { name: string }).name === 'AbortError' ||
        (err as { name: string }).name === 'NotAllowedError')
    ) {
      return [];
    }
    throw err;
  }

  return (raw || [])
    .map((c) => ({
      name: firstString(c.name),
      phone: firstString(c.tel),
    }))
    .filter((c) => c.name || c.phone);
}
