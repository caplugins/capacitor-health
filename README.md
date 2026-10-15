# @caplugins/capacitor-health

Capacitor plugin for **Apple HealthKit** and **Google Health Connect**: one API to read and write
every health data type both platforms offer, from steps and heart rate to sleep, workouts,
nutrition and **reproductive health** (menstrual flow, periods, ovulation tests, cervical mucus,
basal body temperature and more).

> **Status: in design.** Nothing is published yet. The plan is in [docs/](docs/README.md).
> This README will be replaced by the generated API docs (`@capacitor/docgen`) once code lands.

Not to be confused with the unscoped `capacitor-health` package on npm, which is a different
project.

## Why another health plugin?

Existing Capacitor health plugins cover a fixed set of fitness types and leave out reproductive
health entirely, so apps that need cycle data end up writing native code or running two plugins.
This one aims for complete coverage on both platforms behind one type vocabulary, with
idempotent writes and incremental change queries for apps that sync.

## License

MIT
