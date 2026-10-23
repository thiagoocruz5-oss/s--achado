import {adminAuth} from '../lib/runtime.mjs';
export default (req,res)=>adminAuth.handler(req,res);
