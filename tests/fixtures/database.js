'use strict';
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const initializeSchema=require('../../src/database/schema');
const initializeBaseline=require('../../src/database/bootstrap');
const seedSamples=require('./sample-data');
module.exports=function prepareTestDatabase(directory){
 fs.mkdirSync(directory,{recursive:true});
 const db=new DatabaseSync(path.join(directory,'data.sqlite'));
 try {initializeSchema(db);initializeBaseline(db);seedSamples(db);}finally{db.close();}
};
