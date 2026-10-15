import { CapacitorHealth } from '@caplugins/capacitor-health';

window.testEcho = () => {
    const inputValue = document.getElementById("echoInput").value;
    CapacitorHealth.echo({ value: inputValue })
}
