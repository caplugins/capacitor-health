import { CapacitorHealth } from '@caplugins/capacitor-health';

const output = document.getElementById('availability') as HTMLPreElement;

async function checkAvailability(): Promise<void> {
  output.textContent = 'Checking…';
  try {
    const result = await CapacitorHealth.isAvailable();
    output.textContent = JSON.stringify(result, null, 2);
    output.dataset.status = result.status;
  } catch (error) {
    output.textContent = `Error: ${JSON.stringify(error)}`;
    output.dataset.status = 'error';
  }
}

document.getElementById('check-availability')?.addEventListener('click', () => void checkAvailability());
void checkAvailability();
