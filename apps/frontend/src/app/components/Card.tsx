import React from "react";
import { motion } from "framer-motion";

type CardProps = {
  image: string;
  title: string;
  developers: any[];
  delay: number;
  classStyle?: string;
};

const Card: React.FC<CardProps> = ({ image, title, developers, delay, classStyle }) => {
  return (
    <motion.div className={`w-full ${classStyle == "full-parent-content" ? "" : "max-w-96"} h-[25rem] bg-white border rounded-lg shadow-sm hover:shadow-lg flex flex-col justify-center gap-4 overflow-hidden px-4 cursor-pointer hover:-translate-y-3 transition-transform duration-300 ease-in-out`}>
      <img src={image} className="w-auto h-72 object-cover rounded-lg" />
      <div className="w-full flex flex-col gap-1">
        <h1 className="text-2xl sm:text-3xl truncate w-11/12 ms-1 font-montserrat font-semibold">
          {title}
        </h1>
        <h3 className="text-xs sm:text-sm truncate w-11/12 ms-1 font-montserrat text-gray-700">
          By:{" "}
          {developers.map((developer, index) => (
            <span className="font-montserrat text-gray-700 capitalize" key={index}>
              {developer?.student_name?.toLowerCase()}
              {index < developers?.length - 1 ? ", " : ""}
            </span>
          ))}
        </h3>
      </div>
    </motion.div>
  );
};

export default Card;
