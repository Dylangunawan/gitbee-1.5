export const getAllCategory = async () => {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_API}category/all`
    );
    const result = await response.json();

    if (result.status) {
      return { success: true, data: result.data ? result.data : "" };
    } else {
      return { success: false, message: result.message };
    }
  } catch (error: any) {
    console.error("API call failed:", error.message);
  }
};

export const getAllMajor = async () => {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_API}major/all`
    );
    const result = await response.json();

    if (result.status) {
      return { success: true, data: result.data ? result.data : "" };
    } else {
      return { success: false, message: result.message };
    }
  } catch (error: any) {
    console.error("API call failed:", error.message);
  }
};

export const getAllTech = async () => {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_API}technology/all`
    );
    const result = await response.json();

    if (result.status) {
      return { success: true, data: result.data ? result.data : "" };
    } else {
      return { success: false, message: result.message };
    }
  } catch (error: any) {
    console.error("API call failed:", error.message);
  }
};

export const getAllProjects = async (
  search: string,
  categoryFilter: string,
  majorFilter: string,
  technologyFilter: string
) => {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_API}project/all?search=${search}&categoryFilter=${categoryFilter}&majorFilter=${majorFilter}&technologyFilter=${technologyFilter}`
    );
    const result = await response.json();

    if (result.status) {
      return { success: true, data: result.data ? result.data : "" };
    } else {
      return { success: false, message: result.message };
    }
  } catch (error: any) {
    console.error("API call failed:", error.message);
  }
};

export const getProjectById = async (id: string) => {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_API}project/detail?id=${id}`
    );
    const result = await response.json();

    if (result.status) {
      return { success: true, data: result.data ? result.data : "" };
    } else {
      return { success: false, message: result.message };
    }
  } catch (error: any) {
    console.error("API call failed:", error.message);
  }
};
