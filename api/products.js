import {service,adminAuth} from '../lib/runtime.mjs';
import {createHandler} from '../lib/http-handler.mjs';
export default createHandler(service,{productsOnly:true,adminAuth});
