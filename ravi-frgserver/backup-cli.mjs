// Online SQLite snapshot followed by the immutable encrypted objects. The
// backup never contains the encryption key. Run as the service account; keep
// backups and the separately stored key protected and test restores.
import Database from 'better-sqlite3';
import {mkdir,cp,chmod,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';

const source=process.env.CENTRAL_DATA_DIR,target=process.argv[2];
if(!source||!path.isAbsolute(source)||!target||!path.isAbsolute(target)){console.error('Usage: CENTRAL_DATA_DIR=/absolute/data node backup-cli.mjs /absolute/new-backup-directory');process.exit(2)}
const src=path.resolve(source),dst=path.resolve(target);
if(dst===src||dst.startsWith(src+path.sep)||src.startsWith(dst+path.sep)){console.error('Backup directory must be separate from the live data directory.');process.exit(2)}
let db,snapshot,created=false;
try{
 await mkdir(dst,{recursive:false,mode:0o700});created=true;await chmod(dst,0o700);
 db=new Database(path.join(src,'reports.sqlite3'),{readonly:true,fileMustExist:true});
 const snapshotPath=path.join(dst,'reports.sqlite3');
 await db.backup(snapshotPath);await chmod(snapshotPath,0o600);
 // Do not revive old authenticated browser sessions when restoring a backup.
 snapshot=new Database(snapshotPath);snapshot.prepare('DELETE FROM sessions').run();
 snapshot.pragma('wal_checkpoint(TRUNCATE)');snapshot.close();snapshot=null;
 await cp(path.join(src,'objects'),path.join(dst,'objects'),{recursive:true,errorOnExist:true,force:false});
 await writeFile(path.join(dst,'BACKUP.txt'),'SQLite snapshot and encrypted objects. Staff sessions and incoming uploads are excluded. Store CENTRAL_DATA_KEY separately and test a restore.\n',{mode:0o600});
 console.log('Backup created. The encryption key is not included.');
}catch(error){snapshot?.close();snapshot=null;if(created)await rm(dst,{recursive:true,force:true});console.error(`Backup failed: ${error.message}`);process.exitCode=1}finally{snapshot?.close();db?.close()}
