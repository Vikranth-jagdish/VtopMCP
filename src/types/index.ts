export interface AttendanceRecord {
  courseCode: string;
  courseName: string;
  courseType: string;
  attended: number;
  total: number;
  percentage: number;
}

export interface TimetableSlot {
  day: string;
  startTime: string;
  endTime: string;
  courseCode: string;
  courseName: string;
  courseType: string;
  venue: string;
  faculty: string;
}

export interface MarksRecord {
  courseCode: string;
  courseName: string;
  courseType: string;
  marks: {
    component: string;
    maxMarks: number;
    weightage: number;
    scored: number;
    status: string;
  }[];
}

export interface ExamSchedule {
  courseCode: string;
  courseName: string;
  examDate: string;
  session: string;
  time: string;
  venue: string;
  seatNo: string;
}

export interface GradeRecord {
  courseCode: string;
  courseName: string;
  courseType: string;
  credits: number;
  grade: string;
  gradePoints: number;
}

export interface GradeHistory {
  semesters: {
    semester: string;
    gpa: number;
    credits: number;
    grades: GradeRecord[];
  }[];
  cgpa: number;
  totalCredits: number;
}

export interface StudentProfile {
  name: string;
  registrationNumber: string;
  applicationNumber: string;
  program: string;
  branch: string;
  school: string;
  email: string;
  phone: string;
  bloodGroup: string;
}

export interface Semester {
  id: string;
  name: string;
}
