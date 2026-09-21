import validateSchema from "api/utils/validator/validateSchema";
import { APIResponse, defaultResponse } from "api/models/generic/response";
import axios from "axios";
import dotenv from "dotenv";
import { atlantisSchema } from "api/models/generic/generic";
import { getErrors } from "api/utils/response/response";

dotenv.config();

export default class GenericService {
  static async getAtlantisData (credential: string) : Promise<APIResponse> {
    try {
      const res = await axios.get(process.env.ATLANTIS_API, {
        params: {
          input: credential,
        },
      });
      const validationResult = validateSchema(atlantisSchema, res.data);

      if (validationResult.error) {
        return {
          ...defaultResponse,
          errors: validationResult.details,
          data: null,
        };
      }

      return {
        message: "successful",
        status: true,
        data: validationResult.data,
      } as APIResponse;
      
    } catch (error) {
      const err = getErrors(error);
      return {
        ...defaultResponse,
        errors: err,
        data: null,
      };
    }
  };  

  static async getName(credential: string) : Promise<APIResponse> {
    try {
      const result = await this.getAtlantisData(credential);

      let name = "";
      if (result.data.hasOwnProperty('Name') && result.data.hasOwnProperty('email') && result.data.email) {
          name = result.data.Name === "" ? result.data.email[0].Email : result.data.Name;
      }

      return {
        message: "successful",
        status: true,
        data: name,
      } as APIResponse;

    } catch (error) {
      const err = getErrors(error);
      return {
        ...defaultResponse,
        errors: err,
        data: null,
      };
    }
  }

  static async getBinusianID(credential: string) : Promise<APIResponse> {
    try {
      const result = await this.getAtlantisData(credential);

      let BinusianID = "";
      if (result.data.hasOwnProperty('BinusianID') && result.data.hasOwnProperty('email') && result.data.email) {
        BinusianID = result.data.BinusianID === "" ? result.data.email[0].Email : result.data.BinusianID;
      }

      return {
        message: "successful",
        status: true,
        data: BinusianID,
      } as APIResponse;

    } catch (error) {
      const err = getErrors(error);
      return {
        ...defaultResponse,
        errors: err,
        data: null,
      };
    }
  }
}