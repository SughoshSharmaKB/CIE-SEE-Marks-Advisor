/*
 * ============================================================
 *   STUDENT CIE & SEE MARKS ADVISOR
 *   Based on VTU/College Grading Rubric
 *   - Tracks CIE marks per subject
 *   - Calculates required SEE marks for target grade
 *   - Computes SGPA
 * ============================================================
 */

#include <stdio.h>
#include <string.h>
#include <math.h>
#include <stdlib.h>

#define MAX_SUBJECTS 10
#define MAX_NAME 50
#define MAX_LINE 512
#define MAX_FIELD 100

/* ── Course types ── */
#define THEORY       1
#define THEORY_LAB   2
#define LAB_ONLY     3

/* ── Grade table (Table 4.3) ── */
typedef struct {
    char  grade[4];
    float minPct;
    float maxPct;
    int   points;
} GradeEntry;

GradeEntry gradeTable[] = {
    {"O",  90.0, 100.0, 10},
    {"A+", 80.0,  89.9,  9},
    {"A",  70.0,  79.9,  8},
    {"B+", 60.0,  69.9,  7},
    {"B",  55.0,  59.9,  6},
    {"C",  50.0,  54.9,  5},
    {"P",  40.0,  49.9,  4},
    {"F",   0.0,  39.9,  0}
};
int numGrades = 8;

/* ── Subject structure ── */
typedef struct {
    char name[MAX_NAME];
    int  credits;
    int  type;          /* THEORY / THEORY_LAB / LAB_ONLY */

    /* Theory CIE components (max marks) */
    /* Quiz: 2 quizzes × 10 = 20 total */
    float quiz1, quiz2;          /* each out of 10 */
    int   quizDone;              /* 0=none, 1=q1 done, 2=both done */

    /* Tests: each out of 50, reduced to 40 total */
    float test1, test2;          /* each out of 50 */
    int   testDone;              /* 0=none, 1=t1 done, 2=both done */

    /* Experiential Learning: out of 40 */
    float expLearning;
    int   expDone;

    /* Lab components (for THEORY_LAB and LAB_ONLY) */
    /* Lab exercises + report + observation (out of 30 for lab only, 40 for theory+lab) */
    float labExercise;
    int   labExDone;

    /* Lab test: out of 10 */
    float labTest;
    int   labTestDone;

    /* Innovative experiment (lab only course): out of 10 */
    float innovative;
    int   innovDone;

    /* Computed values */
    float cieTotalObtained;   /* marks obtained so far */
    float cieMaxTotal;        /* max CIE marks for this type */
    float cieScaled;          /* scaled to 50 */
    float seePct;             /* SEE marks obtained (%) */
    int   seeDone;
    float finalPct;
    char  grade[4];
    int   gradePoints;

    /* AI Predicted values */
    float ciePredicted;       /* predicted CIE total obtained */
    float ciePredictedScaled; /* predicted CIE scaled to 50 */
    float seePredictedPct;    /* predicted SEE % */
    float finalPctPredicted;  /* predicted final % */
    char  predictedGrade[4];  /* predicted grade */
    int   predictedGradePoints;/* predicted grade points */
} Subject;

/* ── Student structure ── */
typedef struct {
    char    name[MAX_NAME];
    int     rollNo;
    int     numSubjects;
    Subject subjects[MAX_SUBJECTS];
    float   sgpa;
} Student;

/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */

void printLine(char c, int n) {
    for (int i = 0; i < n; i++) printf("%c", c);
    printf("\n");
}

void printHeader(const char *title) {
    printLine('=', 60);
    printf("  %s\n", title);
    printLine('=', 60);
}

/* Get grade and points from percentage */
void getGrade(float pct, char *grade, int *points) {
    for (int i = 0; i < numGrades; i++) {
        if (pct >= gradeTable[i].minPct && pct <= gradeTable[i].maxPct) {
            strcpy(grade, gradeTable[i].grade);
            *points = gradeTable[i].points;
            return;
        }
    }
    strcpy(grade, "F");
    *points = 0;
}

/* Get grade points for a grade letter */
int gradeToPoints(const char *g) {
    for (int i = 0; i < numGrades; i++)
        if (strcmp(gradeTable[i].grade, g) == 0)
            return gradeTable[i].points;
    return 0;
}

/* Get minimum % needed for a grade */
float gradeMinPct(const char *g) {
    for (int i = 0; i < numGrades; i++)
        if (strcmp(gradeTable[i].grade, g) == 0)
            return gradeTable[i].minPct;
    return 0;
}

/* Get grade name description */
const char* gradeDesc(const char *g) {
    if (strcmp(g, "O")  == 0) return "Outstanding";
    if (strcmp(g, "A+") == 0) return "Excellent";
    if (strcmp(g, "A")  == 0) return "Very Good";
    if (strcmp(g, "B+") == 0) return "Good";
    if (strcmp(g, "B")  == 0) return "Above Average";
    if (strcmp(g, "C")  == 0) return "Average";
    if (strcmp(g, "P")  == 0) return "Pass";
    return "Fail";
}

/* Safe float input with range check */
float inputFloat(const char *prompt, float minV, float maxV) {
    float val;
    while (1) {
        printf("%s", prompt);
        if (scanf("%f", &val) == 1 && val >= minV && val <= maxV)
            return val;
        printf("  [!] Enter a value between %.0f and %.0f\n", minV, maxV);
        while (getchar() != '\n');
    }
}

/* Safe int input */
int inputInt(const char *prompt, int minV, int maxV) {
    int val;
    while (1) {
        printf("%s", prompt);
        if (scanf("%d", &val) == 1 && val >= minV && val <= maxV)
            return val;
        printf("  [!] Enter a value between %d and %d\n", minV, maxV);
        while (getchar() != '\n');
    }
}

/* ============================================================
   CIE CALCULATION
   ============================================================ */

/*
 * Theory CIE (max 100):
 *   Quizzes  : Q1(10) + Q2(10) = 20
 *   Tests    : T1(50) + T2(50) → scaled to 40
 *   Exp Learn: 40
 *   Total    : 100
 *
 * Theory+Lab CIE (max 150):
 *   Quizzes  : 20
 *   Tests    : 40
 *   Exp Learn: 40
 *   Lab      : Lab exercises(40) + Lab test(10) = 50
 *   Total    : 150
 *
 * Lab Only CIE (max 50):
 *   Lab exercises + report (30) + Lab test(10) + Innovative(10) = 50
 */

float calcCIE(Subject *s) {
    float total = 0.0;

    if (s->type == THEORY || s->type == THEORY_LAB) {
        /* Quizzes */
        if (s->quizDone >= 1) total += s->quiz1;
        if (s->quizDone >= 2) total += s->quiz2;

        /* Tests — each out of 50, sum scaled to 40 */
        float testSum = 0.0;
        int   testCount = 0;
        if (s->testDone >= 1) { testSum += s->test1; testCount++; }
        if (s->testDone >= 2) { testSum += s->test2; testCount++; }
        if (testCount > 0)
            total += (testSum / (testCount * 50.0)) * 40.0;

        /* Experiential learning */
        if (s->expDone) total += s->expLearning;
    }

    if (s->type == THEORY_LAB) {
        /* Lab exercises out of 40 */
        if (s->labExDone)   total += s->labExercise;
        if (s->labTestDone) total += s->labTest;
    }

    if (s->type == LAB_ONLY) {
        if (s->labExDone)   total += s->labExercise;   /* out of 30 */
        if (s->labTestDone) total += s->labTest;        /* out of 10 */
        if (s->innovDone)   total += s->innovative;     /* out of 10 */
    }

    return total;
}

float getMaxCIE(int type) {
    if (type == THEORY)     return 100.0;
    if (type == THEORY_LAB) return 150.0;
    return 50.0; /* LAB_ONLY */
}

/* Max marks obtainable from PENDING components */
float pendingCIEMax(Subject *s) {
    float pending = 0.0;

    if (s->type == THEORY || s->type == THEORY_LAB) {
        if (s->quizDone < 1) pending += 10.0;
        if (s->quizDone < 2) pending += 10.0;
        /* pending tests contribute to 40-mark pool */
        if (s->testDone == 0) pending += 40.0;
        else if (s->testDone == 1) pending += 20.0; /* approx half */
        if (!s->expDone) pending += 40.0;
    }

    if (s->type == THEORY_LAB) {
        if (!s->labExDone)   pending += 40.0;
        if (!s->labTestDone) pending += 10.0;
    }

    if (s->type == LAB_ONLY) {
        if (!s->labExDone)   pending += 30.0;
        if (!s->labTestDone) pending += 10.0;
        if (!s->innovDone)   pending += 10.0;
    }

    return pending;
}

/* ============================================================
   INPUT SUBJECT DATA
   ============================================================ */

void inputSubject(Subject *s, int idx) {
    printf("\n");
    printLine('-', 50);
    printf("  SUBJECT %d\n", idx + 1);
    printLine('-', 50);

    printf("  Enter subject name       : ");
    scanf(" %[^\n]", s->name);

    s->credits = inputInt("  Enter credits (1-5)      : ", 1, 5);

    printf("  Course type:\n");
    printf("    1. Theory only         (CIE = 100)\n");
    printf("    2. Theory + Lab        (CIE = 150)\n");
    printf("    3. Lab only            (CIE = 50)\n");
    s->type = inputInt("  Choose (1/2/3)            : ", 1, 3);

    printf("\n  -- CIE Components --\n");

    /* ── QUIZZES ── */
    if (s->type == THEORY || s->type == THEORY_LAB) {
        printf("\n  [QUIZZES] Max: Q1=10, Q2=10\n");
        printf("  Quizzes completed? (0=none, 1=Q1 only, 2=both): ");
        s->quizDone = inputInt("  ", 0, 2);
        if (s->quizDone >= 1)
            s->quiz1 = inputFloat("  Quiz 1 marks (out of 10) : ", 0, 10);
        if (s->quizDone >= 2)
            s->quiz2 = inputFloat("  Quiz 2 marks (out of 10) : ", 0, 10);

        /* ── TESTS ── */
        printf("\n  [TESTS] Each out of 50, final scaled to 40\n");
        printf("  Tests completed? (0=none, 1=T1 only, 2=both): ");
        s->testDone = inputInt("  ", 0, 2);
        if (s->testDone >= 1)
            s->test1 = inputFloat("  Test 1 marks (out of 50) : ", 0, 50);
        if (s->testDone >= 2)
            s->test2 = inputFloat("  Test 2 marks (out of 50) : ", 0, 50);

        /* ── EXPERIENTIAL LEARNING ── */
        printf("\n  [EXPERIENTIAL LEARNING] Max: 40\n");
        printf("  Exp. Learning completed? (0=No, 1=Yes): ");
        s->expDone = inputInt("  ", 0, 1);
        if (s->expDone)
            s->expLearning = inputFloat("  Exp. Learning marks (0-40): ", 0, 40);
    }

    /* ── LAB COMPONENTS ── */
    if (s->type == THEORY_LAB) {
        printf("\n  [LAB EXERCISES] Max: 40\n");
        printf("  Lab exercises done? (0=No, 1=Yes): ");
        s->labExDone = inputInt("  ", 0, 1);
        if (s->labExDone)
            s->labExercise = inputFloat("  Lab exercise marks (0-40) : ", 0, 40);

        printf("\n  [LAB TEST] Max: 10\n");
        printf("  Lab test done? (0=No, 1=Yes): ");
        s->labTestDone = inputInt("  ", 0, 1);
        if (s->labTestDone)
            s->labTest = inputFloat("  Lab test marks (0-10)     : ", 0, 10);
    }

    if (s->type == LAB_ONLY) {
        printf("\n  [LAB EXERCISES + REPORT] Max: 30\n");
        printf("  Lab exercises done? (0=No, 1=Yes): ");
        s->labExDone = inputInt("  ", 0, 1);
        if (s->labExDone)
            s->labExercise = inputFloat("  Lab exercise marks (0-30) : ", 0, 30);

        printf("\n  [LAB TEST] Max: 10\n");
        printf("  Lab test done? (0=No, 1=Yes): ");
        s->labTestDone = inputInt("  ", 0, 1);
        if (s->labTestDone)
            s->labTest = inputFloat("  Lab test marks (0-10)     : ", 0, 10);

        printf("\n  [INNOVATIVE EXPERIMENT] Max: 10\n");
        printf("  Innovative experiment done? (0=No, 1=Yes): ");
        s->innovDone = inputInt("  ", 0, 1);
        if (s->innovDone)
            s->innovative = inputFloat("  Innovative marks (0-10)   : ", 0, 10);
    }

    /* ── SEE ── */
    printf("\n  [SEE - Semester End Exam] Max: 100\n");
    printf("  SEE completed? (0=No, 1=Yes): ");
    s->seeDone = inputInt("  ", 0, 1);
    if (s->seeDone)
        s->seePct = inputFloat("  SEE marks (out of 100)   : ", 0, 100);
}

/* ============================================================
   AI PREDICTOR ENGINE (Linear Regression & Gradient Descent)
   ============================================================ */

typedef struct {
    float w;
    float b;
    const char *name;
} LinearModel;

LinearModel quizModel = {0.9f, 0.5f, "Quiz Model"};
LinearModel testModel = {0.85f, 5.0f, "Test Model"};
LinearModel seeModel = {0.9f, 5.0f, "SEE Model"};
LinearModel labTestModel = {0.2f, 1.0f, "Lab Test Model"};

/* Gradient Descent optimizer to fit models to the student's actual scores */
void trainModel(LinearModel *model, float inputs[], float targets[], int count, float lr, int epochs) {
    if (count == 0) return;
    
    float initial_loss = 0.0;
    for (int i = 0; i < count; i++) {
        float diff = (model->w * inputs[i] + model->b) - targets[i];
        initial_loss += diff * diff;
    }
    initial_loss /= count;

    for (int epoch = 0; epoch < epochs; epoch++) {
        float grad_w = 0.0;
        float grad_b = 0.0;
        for (int i = 0; i < count; i++) {
            float pred = model->w * inputs[i] + model->b;
            float error = pred - targets[i];
            grad_w += error * inputs[i];
            grad_b += error;
        }
        model->w -= lr * (grad_w / count);
        model->b -= lr * (grad_b / count);
    }

    float final_loss = 0.0;
    for (int i = 0; i < count; i++) {
        float diff = (model->w * inputs[i] + model->b) - targets[i];
        final_loss += diff * diff;
    }
    final_loss /= count;

    printf("  [AI] Trained %s on %d subjects (Loss: %.4f -> %.4f, w: %.2f, b: %.2f)\n",
           model->name, count, initial_loss, final_loss, model->w, model->b);
}

void trainAI(Student *st) {
    float quiz_in[MAX_SUBJECTS], quiz_tg[MAX_SUBJECTS];
    float test_in[MAX_SUBJECTS], test_tg[MAX_SUBJECTS];
    float see_in[MAX_SUBJECTS], see_tg[MAX_SUBJECTS];
    float lab_in[MAX_SUBJECTS], lab_tg[MAX_SUBJECTS];
    
    int q_cnt = 0, t_cnt = 0, s_cnt = 0, l_cnt = 0;

    for (int i = 0; i < st->numSubjects; i++) {
        Subject *s = &st->subjects[i];
        
        if (s->type == THEORY || s->type == THEORY_LAB) {
            if (s->quizDone == 2) {
                quiz_in[q_cnt] = s->quiz1;
                quiz_tg[q_cnt] = s->quiz2;
                q_cnt++;
            }
            if (s->testDone == 2) {
                test_in[t_cnt] = s->test1;
                test_tg[t_cnt] = s->test2;
                t_cnt++;
            }
        }
        
        if (s->seeDone) {
            float ciePct = (s->cieTotalObtained / s->cieMaxTotal) * 100.0f;
            see_in[s_cnt] = ciePct;
            see_tg[s_cnt] = s->seePct;
            s_cnt++;
        }

        if (s->type == THEORY_LAB || s->type == LAB_ONLY) {
            if (s->labExDone && s->labTestDone) {
                lab_in[l_cnt] = s->labExercise;
                lab_tg[l_cnt] = s->labTest;
                l_cnt++;
            }
        }
    }

    if (q_cnt > 0 || t_cnt > 0 || s_cnt > 0 || l_cnt > 0) {
        printf("\n  [AI] Training predictive models using Gradient Descent...\n");
        trainModel(&quizModel, quiz_in, quiz_tg, q_cnt, 0.01f, 500);
        trainModel(&testModel, test_in, test_tg, t_cnt, 0.0005f, 1000);
        trainModel(&seeModel, see_in, see_tg, s_cnt, 0.0001f, 1000);
        trainModel(&labTestModel, lab_in, lab_tg, l_cnt, 0.0005f, 500);
        printf("  [AI] Training completed successfully!\n");
    } else {
        printf("\n  [AI] Using pre-trained base models (no subject pairs found for training).\n");
    }
}

float predictQuiz2(float q1) {
    float pred = quizModel.w * q1 + quizModel.b;
    if (pred < 0) pred = 0;
    if (pred > 10) pred = 10;
    return pred;
}

float predictTest2(float t1) {
    float pred = testModel.w * t1 + testModel.b;
    if (pred < 0) pred = 0;
    if (pred > 50) pred = 50;
    return pred;
}

float predictLabTest(float labEx) {
    float pred = labTestModel.w * labEx + labTestModel.b;
    if (pred < 0) pred = 0;
    if (pred > 10) pred = 10;
    return pred;
}

float predictSEE(float ciePct) {
    float pred = seeModel.w * ciePct + seeModel.b;
    if (pred < 0) pred = 0;
    if (pred > 100) pred = 100;
    return pred;
}

float predictExp(float q1, float t1) {
    float qPct = q1 / 10.0f;
    float tPct = t1 / 50.0f;
    float score = (0.3f * qPct + 0.7f * tPct) * 40.0f;
    if (score < 0) score = 0;
    if (score > 40) score = 40;
    return score;
}

float getPredictedCIE(Subject *s) {
    float total = 0.0;
    float q1_val = s->quiz1;
    float q2_val = s->quiz2;
    if (s->quizDone == 0) {
        q1_val = 7.5f;
        q2_val = predictQuiz2(q1_val);
    } else if (s->quizDone == 1) {
        q2_val = predictQuiz2(q1_val);
    }
    
    float t1_val = s->test1;
    float t2_val = s->test2;
    if (s->testDone == 0) {
        t1_val = 37.5f;
        t2_val = predictTest2(t1_val);
    } else if (s->testDone == 1) {
        t2_val = predictTest2(t1_val);
    }

    float exp_val = s->expLearning;
    if (!s->expDone) {
        exp_val = predictExp(q1_val, t1_val);
    }

    if (s->type == THEORY || s->type == THEORY_LAB) {
        total += (s->quizDone >= 1 ? s->quiz1 : q1_val);
        total += (s->quizDone >= 2 ? s->quiz2 : q2_val);
        
        float testSum = 0.0;
        if (s->testDone >= 1) testSum += s->test1; else testSum += t1_val;
        if (s->testDone >= 2) testSum += s->test2; else testSum += t2_val;
        total += (testSum / 100.0f) * 40.0f;
        
        total += (s->expDone ? s->expLearning : exp_val);
    }

    if (s->type == THEORY_LAB) {
        float labEx_val = s->labExercise;
        if (!s->labExDone) {
            labEx_val = (q1_val / 10.0f * 0.3f + t1_val / 50.0f * 0.7f) * 40.0f;
        }
        float labTest_val = s->labTest;
        if (!s->labTestDone) {
            labTest_val = predictLabTest(labEx_val);
        }
        total += (s->labExDone ? s->labExercise : labEx_val);
        total += (s->labTestDone ? s->labTest : labTest_val);
    }

    if (s->type == LAB_ONLY) {
        float labEx_val = s->labExercise;
        if (!s->labExDone) labEx_val = 22.5f;
        
        float labTest_val = s->labTest;
        if (!s->labTestDone) labTest_val = predictLabTest(labEx_val);
        
        float innov_val = s->innovative;
        if (!s->innovDone) innov_val = (labEx_val / 30.0f) * 10.0f;
        
        total += (s->labExDone ? s->labExercise : labEx_val);
        total += (s->labTestDone ? s->labTest : labTest_val);
        total += (s->innovDone ? s->innovative : innov_val);
    }

    return total;
}

/* ============================================================
   READ DATA FROM EXCEL-EXPORTED CSV FILE
   ------------------------------------------------------------
   A true .xlsx file is a compressed zip archive containing XML
   and cannot be parsed by plain C without external libraries.
   The practical, portable approach is to have the student fill
   the supplied Excel template and use "Save As -> CSV (Comma
   delimited)" from Excel. The resulting .csv file is then read
   here using standard C file I/O (fopen/fgets/strtok), which is
   fully sufficient since CSV is plain delimited text.

   Expected CSV columns (header row required, exact order):
   StudentName,RollNo,SubjectName,Credits,CourseType,
   Quiz1,Quiz2,Test1,Test2,ExpLearning,
   LabExercise,LabTest,Innovative,SEE,TargetGrade

   - CourseType must be one of: Theory | Theory+Lab | Lab
   - Leave a numeric field EMPTY (just a comma) if that
     component has not yet been completed.
   ============================================================ */

/* Splits one CSV line into fields, honouring empty fields
   (e.g. "a,,c" -> "a", "", "c"). Returns number of fields. */
int splitCSVLine(char *line, char fields[][MAX_FIELD], int maxFields) {
    int count = 0;
    char *start = line;
    char *p = line;

    while (count < maxFields) {
        p = strchr(start, ',');
        int len;
        if (p) {
            len = (int)(p - start);
        } else {
            len = (int)strlen(start);
        }
        if (len >= MAX_FIELD) len = MAX_FIELD - 1;
        strncpy(fields[count], start, len);
        fields[count][len] = '\0';

        /* trim trailing newline / carriage return / spaces */
        int L = (int)strlen(fields[count]);
        while (L > 0 && (fields[count][L-1] == '\n' || fields[count][L-1] == '\r'
                         || fields[count][L-1] == ' ')) {
            fields[count][--L] = '\0';
        }

        count++;
        if (!p) break;
        start = p + 1;
    }
    return count;
}

/* Maps the CourseType text from the sheet to the internal constant */
int parseCourseType(const char *txt) {
    if (strcmp(txt, "Theory") == 0)      return THEORY;
    if (strcmp(txt, "Theory+Lab") == 0)  return THEORY_LAB;
    if (strcmp(txt, "Lab") == 0)         return LAB_ONLY;
    return THEORY; /* safe default */
}

/* Reads up to MAX_SUBJECTS rows from the CSV file into the
   Student structure. Returns 1 on success, 0 on failure. */
int loadFromCSV(const char *filename, Student *st) {
    FILE *fp = fopen(filename, "r");
    if (!fp) {
        printf("  [!] Could not open file '%s'.\n", filename);
        return 0;
    }

    char line[MAX_LINE];
    char fields[15][MAX_FIELD];
    int  rowIndex = 0;

    /* Skip header row */
    if (!fgets(line, MAX_LINE, fp)) { fclose(fp); return 0; }

    while (fgets(line, MAX_LINE, fp) && rowIndex < MAX_SUBJECTS) {
        /* skip blank lines */
        if (strlen(line) <= 1) continue;

        int n = splitCSVLine(line, fields, 15);
        if (n < 15) {
            printf("  [!] Row %d malformed, skipped.\n", rowIndex + 2);
            continue;
        }

        Subject *s = &st->subjects[rowIndex];
        memset(s, 0, sizeof(Subject));

        /* Student-level fields are repeated on every row;
           capture them once from the first valid row */
        if (rowIndex == 0) {
            strncpy(st->name, fields[0], MAX_NAME - 1);
            st->rollNo = atoi(fields[1]);
        }

        strncpy(s->name, fields[2], MAX_NAME - 1);
        s->credits = atoi(fields[3]);
        s->type    = parseCourseType(fields[4]);

        /* Quiz1, Quiz2 */
        if (strlen(fields[5]) > 0) { s->quiz1 = atof(fields[5]); s->quizDone = 1; }
        if (strlen(fields[6]) > 0) { s->quiz2 = atof(fields[6]); s->quizDone = 2; }

        /* Test1, Test2 */
        if (strlen(fields[7]) > 0) { s->test1 = atof(fields[7]); s->testDone = 1; }
        if (strlen(fields[8]) > 0) { s->test2 = atof(fields[8]); s->testDone = 2; }

        /* ExpLearning */
        if (strlen(fields[9]) > 0) { s->expLearning = atof(fields[9]); s->expDone = 1; }

        /* LabExercise, LabTest, Innovative */
        if (strlen(fields[10]) > 0) { s->labExercise = atof(fields[10]); s->labExDone = 1; }
        if (strlen(fields[11]) > 0) { s->labTest     = atof(fields[11]); s->labTestDone = 1; }
        if (strlen(fields[12]) > 0) { s->innovative  = atof(fields[12]); s->innovDone = 1; }

        /* SEE */
        if (strlen(fields[13]) > 0) { s->seePct = atof(fields[13]); s->seeDone = 1; }

        rowIndex++;
    }

    fclose(fp);
    st->numSubjects = rowIndex;
    return rowIndex > 0;
}

/* Reads target grades from the same CSV (15th column) into a
   separate array, since target grade is per-subject metadata
   rather than part of the Subject structure itself. */
int loadTargetGradesFromCSV(const char *filename, char targetGrades[][4], int maxSubjects) {
    FILE *fp = fopen(filename, "r");
    if (!fp) return 0;

    char line[MAX_LINE];
    char fields[15][MAX_FIELD];
    int  rowIndex = 0;

    if (!fgets(line, MAX_LINE, fp)) { fclose(fp); return 0; }

    while (fgets(line, MAX_LINE, fp) && rowIndex < maxSubjects) {
        if (strlen(line) <= 1) continue;
        int n = splitCSVLine(line, fields, 15);
        if (n < 15) continue;
        strncpy(targetGrades[rowIndex], fields[14], 3);
        targetGrades[rowIndex][3] = '\0';
        rowIndex++;
    }
    fclose(fp);
    return 1;
}

/* ============================================================
   COMPUTE & ADVISE
   ============================================================ */

void computeSubject(Subject *s) {
    float maxCIE  = getMaxCIE(s->type);
    float obtained = calcCIE(s);

    s->cieTotalObtained = obtained;
    s->cieMaxTotal      = maxCIE;

    /* Scale CIE to 50 */
    s->cieScaled = (obtained / maxCIE) * 50.0;

    if (s->seeDone) {
        /* SEE scaled to 50 */
        float seeScaled = (s->seePct / 100.0) * 50.0;
        s->finalPct = s->cieScaled + seeScaled;
    } else {
        s->finalPct = -1; /* not yet computable */
    }

    if (s->finalPct >= 0)
        getGrade(s->finalPct, s->grade, &s->gradePoints);
    else {
        strcpy(s->grade, "?");
        s->gradePoints = -1;
    }

    /* AI Prediction Calculations */
    s->ciePredicted = getPredictedCIE(s);
    s->ciePredictedScaled = (s->ciePredicted / maxCIE) * 50.0;

    if (s->seeDone) {
        s->seePredictedPct = s->seePct;
        s->finalPctPredicted = s->finalPct;
    } else {
        float predCiePct = (s->ciePredicted / maxCIE) * 100.0f;
        s->seePredictedPct = predictSEE(predCiePct);
        float seePredScaled = (s->seePredictedPct / 100.0f) * 50.0f;
        s->finalPctPredicted = s->ciePredictedScaled + seePredScaled;
    }
    getGrade(s->finalPctPredicted, s->predictedGrade, &s->predictedGradePoints);
}

void adviseSubject(Subject *s, const char *targetGrade) {
    float maxCIE      = s->cieMaxTotal;
    float obtained    = s->cieTotalObtained;
    float pending     = pendingCIEMax(s);
    float maxPossible = obtained + pending;

    float targetPct   = gradeMinPct(targetGrade);

    /*
     * Final = (CIE/maxCIE)*50 + (SEE/100)*50 >= targetPct
     * => (CIE/maxCIE)*50 + SEEscaled >= targetPct
     * => SEEscaled >= targetPct - (CIE/maxCIE)*50
     *
     * With max CIE:
     * (maxPossible/maxCIE)*50 + SEEscaled >= targetPct
     * => SEEscaled >= targetPct - (maxPossible/maxCIE)*50
     * => SEE% >= (targetPct - (maxPossible/maxCIE)*50) * 2
     */

    float cieScaledNow = (obtained / maxCIE) * 50.0;
    float cieScaledMax = (maxPossible / maxCIE) * 50.0;

    printf("\n  Subject : %s  [%s | %d credits]\n",
           s->name,
           s->type == THEORY ? "Theory" : s->type == THEORY_LAB ? "Theory+Lab" : "Lab Only",
           s->credits);
    printLine('-', 58);

    printf("  CIE so far   : %.1f / %.0f  (%.1f%%)\n",
           obtained, maxCIE, (obtained / maxCIE) * 100.0);
    printf("  CIE scaled   : %.2f / 50\n", cieScaledNow);

    if (s->seeDone) {
        float seeScaled = (s->seePct / 100.0) * 50.0;
        printf("  SEE marks    : %.1f / 100  (scaled: %.2f / 50)\n",
               s->seePct, seeScaled);
        printf("  Final %%      : %.2f%%\n", s->finalPct);
        printf("  Grade        : %s (%s) | Grade Points: %d\n",
               s->grade, gradeDesc(s->grade), s->gradePoints);

        /* Passing check */
        float ciePct = (obtained / maxCIE) * 100.0;
        if (ciePct < 40.0)
            printf("  [!] WARNING: CIE %% (%.1f%%) is below passing standard of 40%%!\n", ciePct);
        if (s->seePct < 35.0)
            printf("  [!] WARNING: SEE %% (%.1f%%) is below passing standard of 35%%!\n", s->seePct);
    } else {
        /* Advise what's needed */
        printf("  Pending CIE  : %.0f marks still available\n", pending);
        printf("  Best possible CIE: %.1f / %.0f → scaled %.2f / 50\n",
               maxPossible, maxCIE, cieScaledMax);
        printf("  AI Predicted CIE : %.1f / %.0f → scaled %.2f / 50\n",
               s->ciePredicted, maxCIE, s->ciePredictedScaled);

        printf("\n  >> AI PREDICTOR ESTIMATE:\n");
        printf("     Predicted SEE score  : %.1f%% (i.e. %.0f / 100)\n",
               s->seePredictedPct, ceil(s->seePredictedPct));
        printf("     Predicted Final %%    : %.2f%%\n", s->finalPctPredicted);
        printf("     Predicted Grade      : %s (%s)\n",
               s->predictedGrade, gradeDesc(s->predictedGrade));

        float needSEEScaled = targetPct - cieScaledMax;
        float needSEEPct    = needSEEScaled * 2.0;

        float needSEEScaledPred = targetPct - s->ciePredictedScaled;
        float needSEEPctPred    = needSEEScaledPred * 2.0;

        printf("\n  >> Target Grade %s requirements (>= %.0f%%):\n",
               targetGrade, targetPct);
        printf("     [OPTIMISTIC (Best Case CIE)]:\n");
        if (needSEEPct <= 0) {
            printf("       Achievable even with 0%% in SEE (requires maxing pending CIE).\n");
        } else if (needSEEPct > 100) {
            printf("       [X] NOT achievable. Max possible final: %.2f%%\n",
                   cieScaledMax + 50.0);
        } else {
            printf("       Minimum SEE needed : %.1f%% (i.e., %.0f / 100)\n",
                   needSEEPct, ceil(needSEEPct));
        }

        printf("     [REALISTIC (AI Predicted CIE)]:\n");
        if (needSEEPctPred <= 0) {
            printf("       Achievable even with 0%% in SEE.\n");
        } else if (needSEEPctPred > 100) {
            printf("       [X] NOT achievable under current trend. Predicted max: %.2f%%\n",
                   s->ciePredictedScaled + 50.0);
        } else {
            printf("       Minimum SEE needed : %.1f%% (i.e., %.0f / 100)\n",
                   needSEEPctPred, ceil(needSEEPctPred));
            if (needSEEPctPred < 35.0) {
                printf("       [!] Note: You must score at least 35%% in SEE to pass, even though %.1f%% is needed for grade.\n", needSEEPctPred);
            }
        }

        printf("\n     [Passing standard  : SEE >= 35%% and CIE >= 40%%]\n");
        float ciePct = (obtained / maxCIE) * 100.0;
        if (ciePct < 40.0) {
            float needed = 0.4 * maxCIE - obtained;
            printf("     [!] Your current CIE is below 40%%. Need %.1f more marks in CIE.\n",
                   needed > 0 ? needed : 0);
        }

        /* Show marks needed in each pending component */
        printf("\n  Pending CIE component targets (to maximize CIE):\n");
        if (s->type == THEORY || s->type == THEORY_LAB) {
            if (s->quizDone < 1) printf("     - Quiz 1      : Score full 10/10\n");
            if (s->quizDone < 2) printf("     - Quiz 2      : Score full 10/10\n");
            if (s->testDone < 2) printf("     - Test %d      : Score as high as possible (out of 50)\n",
                                        s->testDone + 1);
            if (!s->expDone)     printf("     - Exp Learning: Score full 40/40\n");
        }
        if (s->type == THEORY_LAB) {
            if (!s->labExDone)   printf("     - Lab Exercises: Score full 40/40\n");
            if (!s->labTestDone) printf("     - Lab Test     : Score full 10/10\n");
        }
        if (s->type == LAB_ONLY) {
            if (!s->labExDone)   printf("     - Lab Exercises: Score full 30/30\n");
            if (!s->labTestDone) printf("     - Lab Test     : Score full 10/10\n");
            if (!s->innovDone)   printf("     - Innovative   : Score full 10/10\n");
        }
    }
}

/* ============================================================
   SGPA CALCULATION
   ============================================================ */

float calcSGPA(Student *st) {
    float sumCP = 0.0, sumC = 0.0;
    for (int i = 0; i < st->numSubjects; i++) {
        Subject *s = &st->subjects[i];
        if (s->gradePoints >= 0 && s->seeDone) {
            sumCP += s->credits * s->gradePoints;
            sumC  += s->credits;
        }
    }
    if (sumC == 0) return -1;
    return sumCP / sumC;
}

/* Required SGPA advice */
void adviseSGPA(Student *st, float targetSGPA) {
    printf("\n");
    printLine('=', 60);
    printf("  SGPA ANALYSIS\n");
    printLine('=', 60);

    int   allSEEDone = 1;
    float sumCP = 0.0, sumC = 0.0;
    int   pendingSubjects = 0;

    for (int i = 0; i < st->numSubjects; i++) {
        Subject *s = &st->subjects[i];
        if (!s->seeDone) {
            allSEEDone = 0;
            pendingSubjects++;
        } else {
            sumCP += s->credits * s->gradePoints;
            sumC  += s->credits;
        }
    }

    float currentSGPA = (sumC > 0) ? sumCP / sumC : 0;
    printf("  Target SGPA     : %.2f\n", targetSGPA);

    if (allSEEDone) {
        printf("  Your SGPA       : %.2f\n", currentSGPA);
        if (currentSGPA >= targetSGPA)
            printf("  [✓] You have achieved your target SGPA!\n");
        else
            printf("  [X] SGPA %.2f is below target %.2f.\n", currentSGPA, targetSGPA);
    } else {
        printf("  SGPA so far     : %.2f  (%d subject(s) with SEE done)\n",
               currentSGPA, (int)sumC > 0 ? (int)(st->numSubjects - pendingSubjects) : 0);
        printf("  Pending subjects: %d\n", pendingSubjects);

        /* Total credits */
        float totalCredits = 0;
        for (int i = 0; i < st->numSubjects; i++)
            totalCredits += st->subjects[i].credits;

        /* Grade points needed from pending subjects */
        float needed = targetSGPA * totalCredits - sumCP;
        float pendingCredits = totalCredits - sumC;

        if (pendingCredits > 0) {
            float avgGPNeeded = needed / pendingCredits;
            printf("\n  To achieve SGPA %.2f:\n", targetSGPA);
            printf("  You need an average of %.2f grade points\n", avgGPNeeded);
            printf("  across your %d pending subject(s).\n", pendingSubjects);

            /* Map to grade */
            if (avgGPNeeded <= 0) {
                printf("  >> Even with F in all pending subjects, target is achievable!\n");
            } else if (avgGPNeeded > 10) {
                printf("  >> [X] Target SGPA %.2f is not achievable.\n", targetSGPA);
                float maxSGPA = (sumCP + pendingCredits * 10) / totalCredits;
                printf("  >> Maximum possible SGPA: %.2f\n", maxSGPA);
            } else {
                /* Find the grade */
                char needGrade[4] = "O";
                for (int i = numGrades - 1; i >= 0; i--) {
                    if (gradeTable[i].points >= (int)ceil(avgGPNeeded)) {
                        strcpy(needGrade, gradeTable[i].grade);
                    }
                }
                printf("  >> Aim for approximately grade %s (%s) or better\n",
                       needGrade, gradeDesc(needGrade));
                printf("     in each pending subject.\n");
            }
        }
    }
}

/* ============================================================
   SAVE TO FILE
   ============================================================ */

void saveReport(Student *st, float targetSGPA) {
    char filename[80];
    sprintf(filename, "report_%d.txt", st->rollNo);
    FILE *fp = fopen(filename, "w");
    if (!fp) {
        printf("\n  [!] Could not save report.\n");
        return;
    }

    fprintf(fp, "========================================\n");
    fprintf(fp, "  CIE & SEE ADVISOR REPORT\n");
    fprintf(fp, "  Student : %s\n", st->name);
    fprintf(fp, "  Roll No : %d\n", st->rollNo);
    fprintf(fp, "  Target SGPA: %.2f\n", targetSGPA);
    fprintf(fp, "========================================\n\n");

    for (int i = 0; i < st->numSubjects; i++) {
        Subject *s = &st->subjects[i];
        fprintf(fp, "Subject : %s\n", s->name);
        fprintf(fp, "  Credits    : %d\n", s->credits);
        fprintf(fp, "  CIE Marks  : %.1f / %.0f\n", s->cieTotalObtained, s->cieMaxTotal);
        fprintf(fp, "  CIE Scaled : %.2f / 50\n", s->cieScaled);
        if (s->seeDone) {
            fprintf(fp, "  SEE Marks  : %.1f / 100\n", s->seePct);
            fprintf(fp, "  Final %%    : %.2f%%\n", s->finalPct);
            fprintf(fp, "  Grade      : %s (%s)\n", s->grade, gradeDesc(s->grade));
            fprintf(fp, "  Grd Points : %d\n", s->gradePoints);
        } else {
            fprintf(fp, "  SEE        : Pending\n");
            fprintf(fp, "  AI Predicted CIE  : %.1f / %.0f (scaled: %.2f / 50)\n", s->ciePredicted, s->cieMaxTotal, s->ciePredictedScaled);
            fprintf(fp, "  AI Predicted SEE  : %.1f%%\n", s->seePredictedPct);
            fprintf(fp, "  AI Predicted Final: %.2f%%\n", s->finalPctPredicted);
            fprintf(fp, "  AI Predicted Grade: %s (%s)\n", s->predictedGrade, gradeDesc(s->predictedGrade));
        }
        fprintf(fp, "\n");
    }

    if (st->sgpa > 0)
        fprintf(fp, "SGPA : %.2f\n", st->sgpa);

    fclose(fp);
    printf("\n  [✓] Report saved to '%s'\n", filename);
}

/* ============================================================
   MAIN
   ============================================================ */

int main() {
    Student st;
    memset(&st, 0, sizeof(st));

    printHeader("STUDENT CIE & SEE MARKS ADVISOR");
    printf("  Based on your college's CIE/SEE rubric\n\n");

    char targetGrades[MAX_SUBJECTS][4];

    /* ── Choose data entry mode ── */
    printf("  How would you like to enter your data?\n");
    printf("    1. Type marks manually\n");
    printf("    2. Load marks from an Excel-exported CSV file\n");
    int mode = inputInt("  Choose (1/2): ", 1, 2);

    if (mode == 2) {
        char filename[120];
        printf("\n  Enter CSV file name (e.g. marks_input_template.csv): ");
        scanf(" %[^\n]", filename);

        if (!loadFromCSV(filename, &st)) {
            printf("\n  [!] Failed to load data from file. Exiting.\n");
            return 1;
        }
        loadTargetGradesFromCSV(filename, targetGrades, st.numSubjects);

        printf("\n  [OK] Loaded %d subject(s) for %s (Roll No: %d) from '%s'\n",
               st.numSubjects, st.name, st.rollNo, filename);

    } else {
        /* Student details */
        printf("  Enter your name     : ");
        scanf(" %[^\n]", st.name);
        st.rollNo = inputInt("  Enter your roll no  : ", 1, 999999);

        st.numSubjects = inputInt("\n  How many subjects this semester? (1-8): ", 1, MAX_SUBJECTS);

        /* Input all subjects */
        for (int i = 0; i < st.numSubjects; i++)
            inputSubject(&st.subjects[i], i);

        /* Target grade per subject */
        printf("\n  Enter your target grade for each subject.\n");
        printf("  Grades: O | A+ | A | B+ | B | C | P\n");
        printf("\n");
        printLine('=', 60);
        printf("  TARGET GRADES\n");
        printLine('=', 60);
        for (int i = 0; i < st.numSubjects; i++) {
            printf("  Target grade for [%s]: ", st.subjects[i].name);
            scanf("%s", targetGrades[i]);
        }
    }

    /* Target SGPA */
    float targetSGPA = inputFloat("\n  Enter your target SGPA (0.0 - 10.0): ", 0.0, 10.0);

    /* Train AI models based on entered subject pairs */
    trainAI(&st);

    /* Compute */
    for (int i = 0; i < st.numSubjects; i++)
        computeSubject(&st.subjects[i]);

    /* ── REPORT ── */
    printf("\n\n");
    printHeader("PERFORMANCE REPORT");
    printf("  Student : %s   |   Roll No: %d\n\n", st.name, st.rollNo);

    for (int i = 0; i < st.numSubjects; i++)
        adviseSubject(&st.subjects[i], targetGrades[i]);

    /* SGPA */
    st.sgpa = calcSGPA(&st);
    adviseSGPA(&st, targetSGPA);

    /* Grading scale reminder */
    printf("\n");
    printLine('-', 60);
    printf("  GRADE SCALE REFERENCE\n");
    printLine('-', 60);
    printf("  %-6s %-18s %-10s %s\n", "Grade", "Description", "% Range", "Points");
    printLine('-', 60);
    for (int i = 0; i < numGrades; i++)
        printf("  %-6s %-18s %3.0f - %3.0f   %d\n",
               gradeTable[i].grade, gradeDesc(gradeTable[i].grade),
               gradeTable[i].minPct, gradeTable[i].maxPct,
               gradeTable[i].points);

    /* Save report */
    printf("\n");
    int save = inputInt("  Save report to file? (1=Yes, 0=No): ", 0, 1);
    if (save) saveReport(&st, targetSGPA);

    printf("\n");
    printLine('=', 60);
    printf("  Good luck with your exams, %s!\n", st.name);
    printLine('=', 60);
    printf("\n");

    return 0;
}
