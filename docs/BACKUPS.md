# Backups and export

Demain keeps everything in one SQLite file, `demain.db`, in the data volume. There are three ways to keep a copy of it, described in [ARCHITECTURE.md](ARCHITECTURE.md#backups). The first two are on the **Backup and export** page of the app, the third is done on the host.

| | Encrypted snapshot | JSON export | Volume backup |
| --- | --- | --- | --- |
| Purpose | Restore, and keep off-site | Leave Demain, inspect the data | Restore the whole volume |
| Encrypted | Always, with a password you choose | Optional, same password-based encryption | No: protect the file yourself |
| App can stay running | Yes | Yes | No, stop the container first |
| Restorable | Yes | No | Yes |

None of this replaces disk encryption on the host (see [ADR-005](ARCHITECTURE.md#adr-005-encryption-at-rest-delegated-to-the-host)): the database file in the volume is not encrypted.

## Encrypted snapshot

The **Encrypted snapshot** form downloads a `.dmbk` file. The password is typed twice and must have 12 characters at least. **If the password is lost, nobody can open the snapshot**, Demain included.

The copy is taken with SQLite's online backup, so the app keeps running and a write in progress cannot tear it. It is made in a private folder next to the database, encrypted, and removed.

### File format, version 1

All integers are big-endian. The 44 header bytes are authenticated by AES-GCM, so none of them can be changed without the decryption failing.

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 8 | Magic `DEMAINBK` |
| 8 | 1 | Format version (`1`) |
| 9 | 1 | Payload kind: `1` database snapshot, `2` JSON export |
| 10 | 4 | argon2id memory, in KiB (65 536) |
| 14 | 1 | argon2id passes (3) |
| 15 | 1 | argon2id lanes (1) |
| 16 | 16 | argon2id salt, random |
| 32 | 12 | AES-256-GCM nonce, random |
| 44 | n | Ciphertext |
| 44 + n | 16 | AES-256-GCM tag |

The key (32 bytes) is derived from the password with argon2id. The parameters are read from the file, so raising the cost later keeps old files readable, and they are capped (256 MiB, 10 passes, 4 lanes) so that a crafted file cannot exhaust the server. A format version this release does not know is refused.

### Restoring

Use the **Restore a snapshot** form: choose the file, type its password and your current Demain password (a stolen session is not enough to erase the data), then confirm in the dialog that opens on the safe answer. A brand-new instance needs its account first, see [Rebuilding after losing the volume](#rebuilding-after-losing-the-volume).

Before anything is replaced, Demain checks that:

- the password is right and the file is intact;
- the file is a SQLite database made by Demain, and passes SQLite's integrity and foreign key checks;
- it does not come from a newer release than the one running (update Demain first);
- the overflow chains between accounts are valid (no cycle, same currency, no archived target).

If a check fails, nothing is changed. Otherwise the whole database is replaced, **your account and password included**, and what was there is kept as `before-restore.db` in the data folder until the next restore. It is an unencrypted copy: delete it once you are sure of the restore. A snapshot from an older release gets the missing migrations applied. Every session is closed, so you sign in again with the credentials the snapshot holds.

### Rebuilding after losing the volume

1. Start Demain on a new, empty volume (see the README, "Installation") and create the account with the setup token.
2. Sign in, open **Backup and export** and restore the snapshot. The account of the snapshot replaces the temporary one.

## JSON export

The **JSON export** form downloads `demain-export-YYYY-MM-DD.json`. It is meant for leaving Demain or inspecting the data, not for restoring: restoring goes through the snapshot.

- **Not encrypted by default.** The page says so. Typing a password (twice) encrypts the file with the same format as the snapshot, with payload kind `2`; it is then named `.json.enc`.
- **Amounts are integers in minor units**, always next to their currency code: `{ "minorUnits": -1234, "currency": "EUR" }` is -12.34 EUR. There is no decimal number anywhere. An exchange `rate` is an exact integer: 1 `base` is worth `rate / 100000000` `quote`.
- **The credentials of the account are not exported**: no password hash, no second-factor secret or backup code, no session. Neither are the internal keys Demain uses to recognize a movement imported twice.
- Dates are `YYYY-MM-DD` calendar days, instants are ISO 8601 in UTC, and the two legs of a transfer reference each other through `transferCounterpartId`.

The format is defined by [export.schema.json](export.schema.json) (JSON Schema, draft 2020-12), which carries a description of every field. `schemaVersion` is `1`; any change to an existing field is a new version, and a test keeps the schema file in step with the code that writes the export.

### Regenerating the schema

The schema is generated from `src/export/export-schema.ts`. After changing that file, run from the root of the repository:

```sh
node --input-type=module -e "
import { z } from 'zod';
import { writeFileSync } from 'node:fs';
import { exportSchema } from './src/export/export-schema.ts';
writeFileSync('docs/export.schema.json', JSON.stringify(z.toJSONSchema(exportSchema), null, 2) + '\n');
"
```

## Volume backup

This backs up the whole volume, the database included. The container is stopped first: copying a SQLite file while the app is writing can give an inconsistent copy, and with no writer it cannot. The procedure only needs Docker, run it from the folder of your `compose.yaml`.

Find the volume name first (it is prefixed by the name of the folder that holds `compose.yaml`):

```sh
docker volume ls | grep demain-data
```

Back up:

```sh
docker compose stop demain
docker run --rm -v VOLUME_NAME:/data:ro -v "$PWD":/backup alpine:3 \
  tar czf /backup/demain-volume-$(date +%F).tgz -C /data .
docker compose start demain
```

Restore into an empty volume (the stack is stopped, and the volume holds nothing you want to keep):

```sh
docker compose down
docker volume rm VOLUME_NAME
docker volume create VOLUME_NAME
docker run --rm -v VOLUME_NAME:/data -v "$PWD":/backup:ro alpine:3 \
  tar xzf /backup/demain-volume-YYYY-MM-DD.tgz -C /data
docker compose up -d
```

The archive keeps the owner of the files (the unprivileged user of the image), which is why the restore runs as root in a throwaway container. The archive is **not encrypted** and holds the database as is: store it on an encrypted disk, or encrypt it yourself.

Before an upgrade, take either an encrypted snapshot or this volume backup.

### What was tested

The snapshot (creation, restore in the same instance and in a new one, every refusal listed above) and the JSON export (validity against the schema, absence of credentials, encryption) are covered by automated tests in `tests/export/`. The volume procedure was run by hand with Docker: a volume holding a migrated database was archived, deleted, restored into a new volume with the commands above, and the database read back with its integrity check and its data intact.
